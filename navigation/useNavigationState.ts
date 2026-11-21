import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import {
  BackgroundLocationAdapter,
  CameraFollowMode,
  Coordinate,
  GpsSnapshot,
  NavigationPhase,
  NavigationRoute,
  OffRouteDetector,
  SearchPlace,
  VehicleClassId,
  VoiceGuidanceAdapter,
} from './types';
import { fetchValhallaRoute } from './valhalla';
import { haversineKm } from '../services/api';

/**
 * 計算目前位置距離路線折線的近似最短距離（公尺）
 * 作為第二階段偏航重算（Off-route Rerouting）的基礎偵測器
 */
function computeMinDistanceToRouteMeters(current: Coordinate, coords: [number, number][]): number {
  if (!coords.length) return 0;
  let minKm = Number.POSITIVE_INFINITY;
  // 每 2 點取樣一次以維持低耗電量
  const step = coords.length > 300 ? 2 : 1;
  for (let i = 0; i < coords.length; i += step) {
    const [lon, lat] = coords[i];
    const d = haversineKm(current.lat, current.lon, lat, lon);
    if (d < minKm) minKm = d;
  }
  return Math.round(minKm * 1000);
}

/**
 * 第一階段預留介面實作：語音引擎 Stub（第二階段將接入 expo-speech）
 */
function createVoiceGuidanceStub(): VoiceGuidanceAdapter {
  let enabled = false;
  return {
    get isEnabled() {
      return enabled;
    },
    setEnabled(val: boolean) {
      enabled = val;
    },
    async speak(_text: string) {
      // Phase 2: integrate Speech.speak(text, { language: 'zh-TW' })
    },
    stop() {
      // Phase 2: integrate Speech.stop()
    },
  };
}

/**
 * 第一階段預留介面實作：偏航偵測器
 */
function createOffRouteDetector(thresholdMeters = 50): OffRouteDetector {
  return {
    thresholdMeters,
    evaluateDistanceMeters(current: Coordinate, routeCoords: [number, number][]) {
      return computeMinDistanceToRouteMeters(current, routeCoords);
    },
    isOffRoute(current: Coordinate, routeCoords: [number, number][]) {
      return computeMinDistanceToRouteMeters(current, routeCoords) > thresholdMeters;
    },
  };
}

/**
 * 第一階段預留介面實作：背景定位 Stub（第二階段將接入 expo-task-manager）
 */
function createBackgroundLocationStub(): BackgroundLocationAdapter {
  return {
    isSupported: false,
    isRunning: false,
    async start() {
      return false;
    },
    async stop() {},
  };
}

export function useNavigationState(initialRegionCenter: Coordinate) {
  const [phase, setPhase] = useState<NavigationPhase>('idle');
  const [vehicleType, setVehicleType] = useState<VehicleClassId>('car');
  const [avoidTolls, setAvoidTolls] = useState(false);
  const [avoidHighways, setAvoidHighways] = useState(false);
  const [followMode, setFollowMode] = useState<CameraFollowMode>('follow');
  const [gpsPermission, setGpsPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [gps, setGps] = useState<GpsSnapshot | null>(null);
  const [destination, setDestination] = useState<SearchPlace | null>(null);
  const [route, setRoute] = useState<NavigationRoute | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [offRouteDistanceMeters, setOffRouteDistanceMeters] = useState<number | null>(null);

  // Phase 2 擴充介面實例
  const voiceAdapter = useMemo(() => createVoiceGuidanceStub(), []);
  const offRouteDetector = useMemo(() => createOffRouteDetector(50), []);
  const backgroundLocationAdapter = useMemo(() => createBackgroundLocationStub(), []);

  const watcherRef = useRef<Location.LocationSubscription | null>(null);

  // 啟動前景即時 GPS 監聽（支援 iOS & Android 實機定位測試）
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (!active) return;
        if (perm.status !== 'granted') {
          setGpsPermission('denied');
          return;
        }
        setGpsPermission('granted');

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }).catch(() => null);
        if (active && current) {
          setGps({
            lat: current.coords.latitude,
            lon: current.coords.longitude,
            accuracyMeters: current.coords.accuracy ?? null,
            headingDeg: current.coords.heading ?? null,
            speedMps: current.coords.speed ?? null,
            timestamp: current.timestamp,
          });
        }

        watcherRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 1500,
            distanceInterval: 3,
          },
          (loc) => {
            if (!active) return;
            setGps({
              lat: loc.coords.latitude,
              lon: loc.coords.longitude,
              accuracyMeters: loc.coords.accuracy ?? null,
              headingDeg: loc.coords.heading ?? null,
              speedMps: loc.coords.speed ?? null,
              timestamp: loc.timestamp,
            });
          }
        );
      } catch {
        if (active) setGpsPermission('denied');
      }
    })();

    return () => {
      active = false;
      watcherRef.current?.remove();
      watcherRef.current = null;
    };
  }, []);

  // 監測目前位置與路線偏離距離（第一階段僅回報數據，不自動觸發重算）
  useEffect(() => {
    if (phase === 'navigating' && gps && route && route.coordinates.length > 0) {
      const distM = offRouteDetector.evaluateDistanceMeters(
        { lat: gps.lat, lon: gps.lon },
        route.coordinates
      );
      setOffRouteDistanceMeters(distM);
    } else {
      setOffRouteDistanceMeters(null);
    }
  }, [phase, gps, route, offRouteDetector]);

  const effectiveOrigin: Coordinate = useMemo(() => {
    if (gps) return { lat: gps.lat, lon: gps.lon };
    return initialRegionCenter;
  }, [gps, initialRegionCenter]);

  const calculateRoute = useCallback(
    async (target: SearchPlace, opts?: { avoidTolls?: boolean; avoidHighways?: boolean }) => {
      setDestination(target);
      setErrorMessage(null);
      setPhase('routing');
      try {
        const res = await fetchValhallaRoute({
          origin: effectiveOrigin,
          destination: { lat: target.lat, lon: target.lon },
          vehicleType,
          avoidTolls: opts?.avoidTolls ?? avoidTolls,
          avoidHighways: opts?.avoidHighways ?? avoidHighways,
        });
        setRoute(res);
        setPhase('route_preview');
        return res;
      } catch (err: any) {
        setRoute(null);
        setPhase('idle');
        setErrorMessage(err?.message || '路線規劃失敗，請稍後再試');
        return null;
      }
    },
    [effectiveOrigin, vehicleType, avoidTolls, avoidHighways]
  );

  const startNavigationPreview = useCallback(() => {
    if (!route) return;
    setPhase('navigating');
    setFollowMode('course');
  }, [route]);

  const stopNavigationPreview = useCallback(() => {
    voiceAdapter.stop();
    if (route) {
      setPhase('route_preview');
      setFollowMode('free');
    } else {
      setPhase('idle');
    }
  }, [route, voiceAdapter]);

  const clearRoute = useCallback(() => {
    voiceAdapter.stop();
    setRoute(null);
    setDestination(null);
    setErrorMessage(null);
    setPhase('idle');
    setFollowMode('follow');
  }, [voiceAdapter]);

  return {
    phase,
    setPhase,
    vehicleType,
    setVehicleType,
    avoidTolls,
    setAvoidTolls,
    avoidHighways,
    setAvoidHighways,
    followMode,
    setFollowMode,
    gpsPermission,
    gps,
    effectiveOrigin,
    destination,
    setDestination,
    route,
    errorMessage,
    setErrorMessage,
    offRouteDistanceMeters,
    calculateRoute,
    startNavigationPreview,
    stopNavigationPreview,
    clearRoute,
    // Phase 2 擴充介面（供未來語音 / 偏航重算 / 背景定位掛載）
    adapters: {
      voice: voiceAdapter,
      offRoute: offRouteDetector,
      backgroundLocation: backgroundLocationAdapter,
    },
  };
}
