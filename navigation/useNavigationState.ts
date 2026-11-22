import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  CommuteAnchors,
  getNavDiagnostics,
  loadCommuteAnchors,
  loadFavoritePlaces,
  loadRecentSearches,
  recordNavDiagnostic,
  saveCommuteAnchor,
  saveRecentSearch,
  toggleFavoritePlace,
} from './diagnostics';
import {
  buildCumulativeDistances,
  computeNavigationProgress,
  lerpAngleDeg,
  pickVoiceAnnouncement,
  RouteProgressSnapshot,
  samplePolylineAtDistance,
} from './navEngine';
import { fetchValhallaRoute } from './valhalla';
import { getVehicleProfile } from './vehicleRestrictions';

const KEEP_AWAKE_TAG = 'goba-maps-active-navigation';
const ACTIVE_NAV_SESSION_KEY = 'goba_active_nav_session_v1';
const OFF_ROUTE_THRESHOLD_METERS = 55;
const OFF_ROUTE_CONSECUTIVE_HITS = 3;
const REROUTE_COOLDOWN_MS = 12000;
const GPS_STALE_TIMEOUT_MS = 9000;

export interface SavedNavSession {
  destination: SearchPlace;
  vehicleType: VehicleClassId;
  avoidTolls: boolean;
  avoidHighways: boolean;
  startedAt: number;
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

  // 即時導航、語音、GPS 品質與中斷恢復狀態
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [voiceRate, setVoiceRate] = useState<number>(1.0);
  const [bgLocationActive, setBgLocationActive] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simGps, setSimGps] = useState<GpsSnapshot | null>(null);
  const [progress, setProgress] = useState<RouteProgressSnapshot | null>(null);
  const [rerouteCount, setRerouteCount] = useState(0);
  const [rerouteOfflinePending, setRerouteOfflinePending] = useState(false);
  const [gpsSignalLost, setGpsSignalLost] = useState(false);
  const [recoverableSession, setRecoverableSession] = useState<SavedNavSession | null>(null);

  // 常用地點（住家 / 公司）、收藏與最近搜尋
  const [recentPlaces, setRecentPlaces] = useState<SearchPlace[]>([]);
  const [favoritePlaces, setFavoritePlaces] = useState<SearchPlace[]>([]);
  const [commuteAnchors, setCommuteAnchors] = useState<CommuteAnchors>({ home: null, work: null });
  const [inspectedPlace, setInspectedPlace] = useState<SearchPlace | null>(null);

  const voiceAdapter = useMemo(() => createExpoVoiceAdapter(true), []);

  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const simTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastShapeIndexRef = useRef(0);
  const spokenKeysRef = useRef<Set<string>>(new Set());
  const offRouteHitsRef = useRef(0);
  const lastRerouteTsRef = useRef(0);
  const isReroutingRef = useRef(false);
  const smoothHeadingRef = useRef(0);
  const lastGpsFixTsRef = useRef<number>(Date.now());

  // 抗漂移濾波：停等紅燈（車速 < 1.2 m/s）時鎖定最後有效車頭方向，防止靜止時畫面亂轉
  const applyAntiDriftGps = useCallback((incoming: GpsSnapshot) => {
    lastGpsFixTsRef.current = Date.now();
    setGpsSignalLost((prevLost) => {
      if (prevLost) recordNavDiagnostic('gps_signal_restored', 'GPS_RESTORED');
      return false;
    });

    if (typeof incoming.accuracyMeters === 'number' && incoming.accuracyMeters > 45) {
      recordNavDiagnostic('gps_low_accuracy', `ACC_${Math.round(incoming.accuracyMeters)}M`, {
        accuracyMeters: incoming.accuracyMeters,
      });
    }

    const isMoving = (incoming.speedMps ?? 0) >= 1.2;
    if (isMoving && incoming.headingDeg !== null && incoming.headingDeg >= 0) {
      smoothHeadingRef.current = lerpAngleDeg(smoothHeadingRef.current, incoming.headingDeg, 0.35);
    }

    setGps({
      ...incoming,
      headingDeg: smoothHeadingRef.current,
    });
  }, []);

  const bgLocationAdapter = useMemo(
    () =>
      createExpoBackgroundLocationAdapter((snapshot) => {
        applyAntiDriftGps(snapshot);
      }),
    [applyAntiDriftGps]
  );

  // 載入未完成導航會話、最近搜尋與收藏地點
  useEffect(() => {
    AsyncStorage.getItem(ACTIVE_NAV_SESSION_KEY)
      .then((raw) => {
        if (!raw) return;
        const parsed = JSON.parse(raw) as SavedNavSession;
        if (
          parsed?.destination &&
          Date.now() - Number(parsed.startedAt || 0) < 2 * 60 * 60 * 1000
        ) {
          setRecoverableSession(parsed);
        } else {
          AsyncStorage.removeItem(ACTIVE_NAV_SESSION_KEY).catch(() => {});
        }
      })
      .catch(() => {});

    loadRecentSearches().then(setRecentPlaces);
    loadFavoritePlaces().then(setFavoritePlaces);
    loadCommuteAnchors().then(setCommuteAnchors);
  }, []);

  // App 回到前景時自動同步最新 GPS 位置（處理鎖屏／來電／切換 App 恢復）
  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState === 'active') {
        recordNavDiagnostic('app_foreground_resync', 'FOREGROUND');
        try {
          const fresh = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.BestForNavigation,
          });
          applyAntiDriftGps({
            lat: fresh.coords.latitude,
            lon: fresh.coords.longitude,
            accuracyMeters: fresh.coords.accuracy ?? null,
            headingDeg: fresh.coords.heading ?? null,
            speedMps: fresh.coords.speed ?? null,
            timestamp: fresh.timestamp,
          });
        } catch {
          // ignore
        }
      }
    });
    return () => sub.remove();
  }, [applyAntiDriftGps]);

  // 監測真實導航期間 GPS 訊號中斷（超過 9 秒無新訊號時提示，訊號進來自動恢復）
  useEffect(() => {
    if (phase !== 'navigating' || isSimulating) {
      setGpsSignalLost(false);
      return;
    }
    const timer = setInterval(() => {
      const elapsed = Date.now() - lastGpsFixTsRef.current;
      if (elapsed > GPS_STALE_TIMEOUT_MS) {
        setGpsSignalLost((already) => {
          if (!already) recordNavDiagnostic('gps_signal_lost', 'NO_FIX_9S');
          return true;
        });
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [phase, isSimulating]);

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

  const cycleVoiceRate = useCallback(() => {
    const order = [0.88, 1.0, 1.15];
    const labels: Record<number, string> = { 0.88: '慢速', 1.0: '標準', 1.15: '快速' };
    const idx = order.indexOf(voiceRate);
    const next = order[(idx + 1) % order.length];
    setVoiceRate(next);
    voiceAdapter.setRate(next);
    voiceAdapter.speak(`語速已設為${labels[next] || '標準'}`);
  }, [voiceRate, voiceAdapter]);

  const testVoiceGuidance = useCallback(() => {
    voiceAdapter.setEnabled(true);
    setVoiceEnabled(true);
    voiceAdapter.speak('鍋巴導航語音測試，前方一百五十公尺，右轉進入忠孝東路四段');
  }, [voiceAdapter]);

  // 啟動前景即時 GPS 監聽
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
          applyAntiDriftGps({
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
            applyAntiDriftGps({
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
  }, [applyAntiDriftGps, bgLocationAdapter, voiceAdapter]);

  // 導航中維持螢幕恆亮
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

  const gpsWeakSignal = useMemo(() => {
    if (isSimulating || !activeGps || activeGps.accuracyMeters === null) return false;
    return activeGps.accuracyMeters > 45;
  }, [isSimulating, activeGps]);

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
        saveRecentSearch(target).then(setRecentPlaces);
      }
      const t0 = Date.now();
      try {
        const res = await fetchValhallaRoute({
          origin: opts?.originOverride ?? effectiveOrigin,
          destination: { lat: target.lat, lon: target.lon },
          destinationPlaceId: target.placeId || target.id,
          vehicleType: opts?.vehicleTypeOverride ?? vehicleType,
          avoidTolls: opts?.avoidTolls ?? avoidTolls,
          avoidHighways: opts?.avoidHighways ?? avoidHighways,
        });
        recordNavDiagnostic('route_ok', res.vehicleType, { latencyMs: Date.now() - t0 });
        lastShapeIndexRef.current = 0;
        spokenKeysRef.current.clear();
        offRouteHitsRef.current = 0;
        setRerouteOfflinePending(false);
        setRoute(res);
        setProgress(null);
        setPhase(opts?.keepNavigating ? 'navigating' : 'route_preview');
        return res;
      } catch (err: any) {
        recordNavDiagnostic('route_error', 'ROUTE_FAIL', { latencyMs: Date.now() - t0 });
        if (!opts?.keepNavigating) {
          setRoute(null);
          setPhase('idle');
          setErrorMessage(err?.message || '路線規劃失敗，請稍後再試');
        } else {
          // 偏航重算失敗時保留原路線與安全畫面狀態，待網路恢復後自動再試
          setRerouteOfflinePending(true);
          setPhase('navigating');
          recordNavDiagnostic('reroute_failed_offline', 'KEEP_SAFE_STATE');
        }
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

  const handleToggleFavorite = useCallback(async (place: SearchPlace) => {
    const updated = await toggleFavoritePlace(place);
    setFavoritePlaces(updated);
  }, []);

  const handleSetCommuteAnchor = useCallback(
    async (slot: 'home' | 'work', place: SearchPlace | null) => {
      const updated = await saveCommuteAnchor(slot, place);
      setCommuteAnchors(updated);
    },
    []
  );

  const triggerOffRouteReroute = useCallback(
    async (currentCoord: Coordinate) => {
      if (!destination || isReroutingRef.current) return;
      const now = Date.now();
      if (now - lastRerouteTsRef.current < REROUTE_COOLDOWN_MS) return;

      isReroutingRef.current = true;
      lastRerouteTsRef.current = now;
      offRouteHitsRef.current = 0;
      setPhase('off_route_recalculating');
      recordNavDiagnostic('off_route_reroute', `REROUTE_${rerouteCount + 1}`);
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
    [destination, calculateRoute, voiceAdapter, rerouteCount]
  );

  // 即時導航進度計算、抗漂移語音觸發、偏航重算與抵達判定
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
      AsyncStorage.removeItem(ACTIVE_NAV_SESSION_KEY).catch(() => {});
      voiceAdapter.speak('已抵達目的地，導航結束');
      return;
    }

    // 若 GPS 精度過差（> 60m），暫不觸發偏航重算或轉彎語音，防止漂移誤判
    const accuracyOk = (activeGps.accuracyMeters ?? 15) <= 60;
    if (!accuracyOk && !isSimulating) {
      return;
    }

    // 2. 偏航偵測（連續 3 次有效 GPS 點偏離 > 55m 才觸發，防止單點漂移誤判）
    if (!isSimulating) {
      if (snap.distanceToRouteMeters > OFF_ROUTE_THRESHOLD_METERS) {
        offRouteHitsRef.current += 1;
        if (offRouteHitsRef.current >= OFF_ROUTE_CONSECUTIVE_HITS) {
          triggerOffRouteReroute({ lat: activeGps.lat, lon: activeGps.lon });
          return;
        }
      } else {
        offRouteHitsRef.current = 0;
        if (rerouteOfflinePending) setRerouteOfflinePending(false);
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
  }, [
    phase,
    activeGps,
    route,
    isSimulating,
    rerouteOfflinePending,
    bgLocationAdapter,
    voiceAdapter,
    triggerOffRouteReroute,
  ]);

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
    setRerouteOfflinePending(false);
    setRecoverableSession(null);
    setPhase('navigating');
    setFollowMode('course');

    if (destination) {
      const snapshot: SavedNavSession = {
        destination,
        vehicleType,
        avoidTolls,
        avoidHighways,
        startedAt: Date.now(),
      };
      AsyncStorage.setItem(ACTIVE_NAV_SESSION_KEY, JSON.stringify(snapshot)).catch(() => {});
    }

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
  }, [route, destination, vehicleType, avoidTolls, avoidHighways, bgLocationAdapter, voiceAdapter]);

  const pauseNavigation = useCallback(() => {
    if (phase !== 'navigating') return;
    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }
    voiceAdapter.stop();
    setPhase('paused');
    setFollowMode('free');
  }, [phase, voiceAdapter]);

  const resumeNavigation = useCallback(() => {
    if (phase !== 'paused' || !route) return;
    setPhase('navigating');
    setFollowMode('course');
    const step = progress?.nextManeuver || route.maneuvers[0];
    if (step) {
      voiceAdapter.speak(`繼續導航，${step.instruction}`);
    }
  }, [phase, route, progress, voiceAdapter]);

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
    setFollowMode('course');

    const coords = route.coordinates;
    const cumDist = buildCumulativeDistances(coords);
    const profile = getVehicleProfile(route.vehicleType);
    const simSpeed = Math.max(profile.simSpeedMps * 1.8, 8);
    const tickMs = 50;
    const metersPerTick = simSpeed * (tickMs / 1000);
    let traveledMeters = 0;

    const initialSample = samplePolylineAtDistance(coords, cumDist, 0, 28);
    smoothHeadingRef.current = initialSample.headingDeg;
    setSimGps({
      lat: initialSample.lat,
      lon: initialSample.lon,
      accuracyMeters: 5,
      headingDeg: initialSample.headingDeg,
      speedMps: profile.simSpeedMps,
      timestamp: Date.now(),
    });

    voiceAdapter.speak(
      `開始${profile.label}模擬導航，全程 ${route.distanceKm.toFixed(1)} 公里。${
        route.maneuvers[0]?.instruction || ''
      }`
    );

    simTimerRef.current = setInterval(() => {
      traveledMeters += metersPerTick;
      const sample = samplePolylineAtDistance(coords, cumDist, traveledMeters, 30);
      smoothHeadingRef.current = lerpAngleDeg(smoothHeadingRef.current, sample.headingDeg, 0.22);

      setSimGps({
        lat: sample.lat,
        lon: sample.lon,
        accuracyMeters: 5,
        headingDeg: smoothHeadingRef.current,
        speedMps: profile.simSpeedMps,
        timestamp: Date.now(),
      });

      if (sample.finished && simTimerRef.current) {
        clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
    }, tickMs);
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
    setRerouteOfflinePending(false);
    AsyncStorage.removeItem(ACTIVE_NAV_SESSION_KEY).catch(() => {});
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
    setInspectedPlace(null);
    setProgress(null);
    setRerouteOfflinePending(false);
    setErrorMessage(null);
    setPhase('idle');
    setFollowMode('follow');
    AsyncStorage.removeItem(ACTIVE_NAV_SESSION_KEY).catch(() => {});
  }, [voiceAdapter, bgLocationAdapter]);

  const dismissRecoveredSession = useCallback(() => {
    setRecoverableSession(null);
    AsyncStorage.removeItem(ACTIVE_NAV_SESSION_KEY).catch(() => {});
  }, []);

  const resumeRecoveredSession = useCallback(async () => {
    if (!recoverableSession) return;
    const saved = recoverableSession;
    setRecoverableSession(null);
    setVehicleType(saved.vehicleType);
    setAvoidTolls(saved.avoidTolls);
    setAvoidHighways(saved.avoidHighways);
    const updated = await calculateRoute(saved.destination, {
      vehicleTypeOverride: saved.vehicleType,
      avoidTolls: saved.avoidTolls,
      avoidHighways: saved.avoidHighways,
      keepNavigating: true,
    });
    if (updated) {
      setFollowMode('course');
      const bgStarted = await bgLocationAdapter.start();
      setBgLocationActive(bgStarted);
      voiceAdapter.speak(`已恢復前往${saved.destination.name}的導航`);
    }
  }, [recoverableSession, calculateRoute, bgLocationAdapter, voiceAdapter]);

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
    gpsWeakSignal,
    gpsSignalLost,
    effectiveOrigin,
    destination,
    setDestination,
    route,
    progress,
    speedKmh,
    voiceEnabled,
    voiceRate,
    toggleVoice,
    cycleVoiceRate,
    testVoiceGuidance,
    bgLocationActive,
    isSimulating,
    rerouteCount,
    rerouteOfflinePending,
    triggerOffRouteReroute,
    recoverableSession,
    resumeRecoveredSession,
    dismissRecoveredSession,
    recentPlaces,
    favoritePlaces,
    commuteAnchors,
    inspectedPlace,
    setInspectedPlace,
    handleToggleFavorite,
    handleSetCommuteAnchor,
    getDiagnostics: getNavDiagnostics,
    errorMessage,
    setErrorMessage,
    calculateRoute,
    startNavigation,
    pauseNavigation,
    resumeNavigation,
    startSimulatedNavigation,
    stopNavigation,
    clearRoute,
  };
}
