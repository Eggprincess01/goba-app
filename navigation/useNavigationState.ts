import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as KeepAwake from 'expo-keep-awake';
import * as Location from 'expo-location';
import {
  CameraFollowMode,
  Coordinate,
  GpsSnapshot,
  NavigationPhase,
  NavigationRoute,
  SearchPlace,
  VehicleClassId,
} from './types';
import {
  createExpoBackgroundLocationAdapter,
  createExpoVoiceAdapter,
} from './adapters';
import {
  computeBearingDeg,
  computeNavigationProgress,
  pickVoiceAnnouncement,
  RouteProgressSnapshot,
} from './navEngine';
import { fetchValhallaRoute } from './valhalla';
import { getVehicleProfile } from './vehicleRestrictions';

const KEEP_AWAKE_TAG = 'goba-maps-active-navigation';
const OFF_ROUTE_THRESHOLD_METERS = 55;
const OFF_ROUTE_CONSECUTIVE_HITS = 2;
const REROUTE_COOLDOWN_MS = 10000;

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

  // Phase 2 即時導航狀態
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [bgLocationActive, setBgLocationActive] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simGps, setSimGps] = useState<GpsSnapshot | null>(null);
  const [progress, setProgress] = useState<RouteProgressSnapshot | null>(null);
  const [rerouteCount, setRerouteCount] = useState(0);

  const voiceAdapter = useMemo(() => createExpoVoiceAdapter(true), []);
  const bgLocationAdapter = useMemo(
    () =>
      createExpoBackgroundLocationAdapter((snapshot) => {
        setGps(snapshot);
      }),
    []
  );

  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const simTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastShapeIndexRef = useRef(0);
  const spokenKeysRef = useRef<Set<string>>(new Set());
  const offRouteHitsRef = useRef(0);
  const lastRerouteTsRef = useRef(0);
  const isReroutingRef = useRef(false);

  // 同步語音開關至引擎
  const toggleVoice = useCallback(() => {
    setVoiceEnabled((prev) => {
      const next = !prev;
      voiceAdapter.setEnabled(next);
      if (next) {
        voiceAdapter.speak('已開啟語音導航');
      }
      return next;
    });
  }, [voiceAdapter]);

  // 啟動前景即時 GPS 監聽（iOS BestForNavigation 等級）
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
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1000,
            distanceInterval: 2,
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
      if (simTimerRef.current) {
        clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
      bgLocationAdapter.stop();
      voiceAdapter.stop();
      KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [bgLocationAdapter, voiceAdapter]);

  // 導航中自動維持螢幕恆亮
  useEffect(() => {
    const isActiveNav = phase === 'navigating' || phase === 'off_route_recalculating';
    if (isActiveNav) {
      KeepAwake.activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    } else {
      KeepAwake.deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    }
  }, [phase]);

  const activeGps = isSimulating && simGps ? simGps : gps;

  const effectiveOrigin: Coordinate = useMemo(() => {
    if (activeGps) return { lat: activeGps.lat, lon: activeGps.lon };
    return initialRegionCenter;
  }, [activeGps, initialRegionCenter]);

  const calculateRoute = useCallback(
    async (
      target: SearchPlace,
      opts?: {
        avoidTolls?: boolean;
        avoidHighways?: boolean;
        vehicleTypeOverride?: VehicleClassId;
        originOverride?: Coordinate;
        keepNavigating?: boolean;
      }
    ) => {
      setDestination(target);
      setErrorMessage(null);
      if (!opts?.keepNavigating) {
        setPhase('routing');
      }
      try {
        const res = await fetchValhallaRoute({
          origin: opts?.originOverride ?? effectiveOrigin,
          destination: { lat: target.lat, lon: target.lon },
          vehicleType: opts?.vehicleTypeOverride ?? vehicleType,
          avoidTolls: opts?.avoidTolls ?? avoidTolls,
          avoidHighways: opts?.avoidHighways ?? avoidHighways,
        });
        lastShapeIndexRef.current = 0;
        spokenKeysRef.current.clear();
        offRouteHitsRef.current = 0;
        setRoute(res);
        setProgress(null);
        setPhase(opts?.keepNavigating ? 'navigating' : 'route_preview');
        return res;
      } catch (err: any) {
        if (!opts?.keepNavigating) {
          setRoute(null);
          setPhase('idle');
        } else {
          setPhase('navigating');
        }
        setErrorMessage(err?.message || '路線規劃失敗，請稍後再試');
        return null;
      }
    },
    [effectiveOrigin, vehicleType, avoidTolls, avoidHighways]
  );

  const selectVehicleType = useCallback(
    async (nextType: VehicleClassId) => {
      setVehicleType(nextType);
      if (destination && phase !== 'navigating' && phase !== 'off_route_recalculating') {
        await calculateRoute(destination, { vehicleTypeOverride: nextType });
      }
    },
    [destination, phase, calculateRoute]
  );

  // 偏航自動重算
  const triggerOffRouteReroute = useCallback(
    async (currentCoord: Coordinate) => {
      if (!destination || isReroutingRef.current) return;
      const now = Date.now();
      if (now - lastRerouteTsRef.current < REROUTE_COOLDOWN_MS) return;

      isReroutingRef.current = true;
      lastRerouteTsRef.current = now;
      offRouteHitsRef.current = 0;
      setPhase('off_route_recalculating');
      voiceAdapter.speak('已偏離路線，正在為您重新規劃');

      try {
        const updated = await calculateRoute(destination, {
          originOverride: currentCoord,
          keepNavigating: true,
        });
        if (updated) {
          setRerouteCount((c) => c + 1);
          const firstStep = updated.maneuvers[1] || updated.maneuvers[0];
          if (firstStep) {
            voiceAdapter.speak(`已重新規劃路線，${firstStep.instruction}`);
          }
        }
      } finally {
        isReroutingRef.current = false;
      }
    },
    [destination, calculateRoute, voiceAdapter]
  );

  // 核心即時導航進度計算、語音播報、偏航偵測與抵達判定
  useEffect(() => {
    if (phase !== 'navigating' || !activeGps || !route || route.coordinates.length < 2) {
      return;
    }

    const snap = computeNavigationProgress(
      { lat: activeGps.lat, lon: activeGps.lon },
      route,
      lastShapeIndexRef.current
    );
    lastShapeIndexRef.current = snap.nearestShapeIndex;
    setProgress(snap);

    // 1. 抵達判定
    if (snap.hasArrived) {
      if (simTimerRef.current) {
        clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
      setIsSimulating(false);
      setPhase('arrived');
      setFollowMode('free');
      bgLocationAdapter.stop();
      setBgLocationActive(false);
      voiceAdapter.speak('已抵達目的地，導航結束');
      return;
    }

    // 2. 偏航偵測（僅真實 GPS 模式觸發，避免模擬模式誤觸）
    if (!isSimulating) {
      if (snap.distanceToRouteMeters > OFF_ROUTE_THRESHOLD_METERS) {
        offRouteHitsRef.current += 1;
        if (offRouteHitsRef.current >= OFF_ROUTE_CONSECUTIVE_HITS) {
          triggerOffRouteReroute({ lat: activeGps.lat, lon: activeGps.lon });
          return;
        }
      } else {
        offRouteHitsRef.current = 0;
      }
    }

    // 3. 語音轉彎播報（500m / 150m / 35m 門檻）
    const announcement = pickVoiceAnnouncement(
      snap.nextManeuver,
      snap.distanceToNextTurnMeters,
      spokenKeysRef.current
    );
    if (announcement) {
      spokenKeysRef.current.add(announcement.key);
      voiceAdapter.speak(announcement.text);
    }
  }, [phase, activeGps, route, isSimulating, bgLocationAdapter, voiceAdapter, triggerOffRouteReroute]);

  // 啟動真實 GPS 語音導航
  const startNavigation = useCallback(async () => {
    if (!route) return;
    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
    setIsSimulating(false);
    setSimGps(null);
    lastShapeIndexRef.current = 0;
    spokenKeysRef.current.clear();
    offRouteHitsRef.current = 0;
    setRerouteCount(0);
    setPhase('navigating');
    setFollowMode('course');

    // 嘗試啟用 iOS 背景定位（使用者若僅允許使用期間則自動維持前景運作）
    const bgStarted = await bgLocationAdapter.start();
    setBgLocationActive(bgStarted);

    const startStep = route.maneuvers[0];
    const nextStep = route.maneuvers[1];
    const mins = Math.max(1, Math.round(route.durationSec / 60));
    voiceAdapter.speak(
      `開始導航，全程 ${route.distanceKm.toFixed(1)} 公里，預計 ${mins} 分鐘。${
        nextStep ? nextStep.instruction : startStep?.instruction || ''
      }`
    );
  }, [route, bgLocationAdapter, voiceAdapter]);

  // 啟動模擬行駛測試（可在室內直接測試語音播報、轉彎切換、距離倒數與抵達）
  const startSimulatedNavigation = useCallback(() => {
    if (!route || route.coordinates.length < 2) return;
    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
    lastShapeIndexRef.current = 0;
    spokenKeysRef.current.clear();
    offRouteHitsRef.current = 0;
    setIsSimulating(true);
    setPhase('navigating');
    setFollowMode('free');

    const coords = route.coordinates;
    let idx = 0;
    const stepSize = Math.max(1, Math.floor(coords.length / 70));

    const profile = getVehicleProfile(route.vehicleType);
    const simSpeed = profile.simSpeedMps;

    const firstHeading = computeBearingDeg(
      { lat: coords[0][1], lon: coords[0][0] },
      { lat: coords[1][1], lon: coords[1][0] }
    );
    setSimGps({
      lat: coords[0][1],
      lon: coords[0][0],
      accuracyMeters: 5,
      headingDeg: firstHeading,
      speedMps: simSpeed,
      timestamp: Date.now(),
    });

    voiceAdapter.speak(
      `開始${profile.label}模擬導航，全程 ${route.distanceKm.toFixed(1)} 公里。${route.maneuvers[0]?.instruction || ''}`
    );

    simTimerRef.current = setInterval(() => {
      idx = Math.min(coords.length - 1, idx + stepSize);
      const curr = coords[idx];
      const next = coords[Math.min(coords.length - 1, idx + 1)];
      const prev = coords[Math.max(0, idx - 1)];
      const heading = computeBearingDeg(
        { lat: prev[1], lon: prev[0] },
        { lat: next[1], lon: next[0] }
      );
      setSimGps({
        lat: curr[1],
        lon: curr[0],
        accuracyMeters: 5,
        headingDeg: heading,
        speedMps: simSpeed,
        timestamp: Date.now(),
      });
      if (idx >= coords.length - 1 && simTimerRef.current) {
        clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
    }, 650);
  }, [route, voiceAdapter]);

  const stopNavigation = useCallback(() => {
    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
    setIsSimulating(false);
    setSimGps(null);
    voiceAdapter.stop();
    bgLocationAdapter.stop();
    setBgLocationActive(false);
    setProgress(null);
    if (route) {
      setPhase('route_preview');
      setFollowMode('free');
    } else {
      setPhase('idle');
    }
  }, [route, voiceAdapter, bgLocationAdapter]);

  const clearRoute = useCallback(() => {
    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
    setIsSimulating(false);
    setSimGps(null);
    voiceAdapter.stop();
    bgLocationAdapter.stop();
    setBgLocationActive(false);
    setRoute(null);
    setDestination(null);
    setProgress(null);
    setErrorMessage(null);
    setPhase('idle');
    setFollowMode('follow');
  }, [voiceAdapter, bgLocationAdapter]);

  const speedKmh = useMemo(() => {
    if (!activeGps || activeGps.speedMps === null || activeGps.speedMps < 0) return 0;
    return Math.round(activeGps.speedMps * 3.6);
  }, [activeGps]);

  return {
    phase,
    setPhase,
    vehicleType,
    setVehicleType: selectVehicleType,
    avoidTolls,
    setAvoidTolls,
    avoidHighways,
    setAvoidHighways,
    followMode,
    setFollowMode,
    gpsPermission,
    gps: activeGps,
    effectiveOrigin,
    destination,
    setDestination,
    route,
    progress,
    speedKmh,
    voiceEnabled,
    toggleVoice,
    bgLocationActive,
    isSimulating,
    rerouteCount,
    errorMessage,
    setErrorMessage,
    calculateRoute,
    startNavigation,
    startSimulatedNavigation,
    stopNavigation,
    clearRoute,
  };
}
