import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as KeepAwake from 'expo-keep-awake';
import * as Location from 'expo-location';
import {
  CameraFollowMode,
  Coordinate,
  GpsSnapshot,
  NavCommandState,
  NavigationPhase,
  NavigationRoute,
  ReroutePerformanceEntry,
  SearchPlace,
  VehicleClassId,
  VoiceLogEntry,
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
  formatDistanceMetersZh,
  lerpAngleDeg,
  pickVoiceAnnouncement,
  RouteProgressSnapshot,
  samplePolylineAtDistance,
} from './navEngine';
import { fetchValhallaRoute } from './valhalla';
import { getVehicleProfile } from './vehicleRestrictions';

const KEEP_AWAKE_TAG = 'goba-maps-active-navigation';
const ACTIVE_NAV_SESSION_KEY = 'goba_active_nav_session_v1';
const OFF_ROUTE_THRESHOLD_METERS = 25;
const OFF_ROUTE_CONSECUTIVE_HITS = 2;
const WRONG_WAY_CONSECUTIVE_HITS = 2;
const REROUTE_COOLDOWN_MS = 3800;
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
  const [customOrigin, setCustomOriginState] = useState<SearchPlace | null>(null);
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
  const [commandState, setCommandState] = useState<NavCommandState>('FOLLOWING_ROUTE');
  const [voiceHistory, setVoiceHistory] = useState<VoiceLogEntry[]>([]);
  const [rerouteMetrics, setRerouteMetrics] = useState<ReroutePerformanceEntry[]>([]);

  // 常用地點（住家 / 公司）、收藏與最近搜尋
  const [recentPlaces, setRecentPlaces] = useState<SearchPlace[]>([]);
  const [favoritePlaces, setFavoritePlaces] = useState<SearchPlace[]>([]);
  const [commuteAnchors, setCommuteAnchors] = useState<CommuteAnchors>({ home: null, work: null });
  const [inspectedPlace, setInspectedPlace] = useState<SearchPlace | null>(null);

  const voiceAdapter = useMemo(() => createExpoVoiceAdapter(true), []);

  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const simTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastShapeIndexRef = useRef(0);
  const lastActiveManeuverIdxRef = useRef<number | null>(null);
  const lastDistanceToNextTurnRef = useRef<number | null>(null);
  const spokenKeysRef = useRef<Set<string>>(new Set());
  const offRouteHitsRef = useRef(0);
  const wrongWayHitsRef = useRef(0);
  const offRouteFirstSeenTsRef = useRef<number>(0);
  const lastRerouteTsRef = useRef(0);
  const isReroutingRef = useRef(false);
  const routeVersionRef = useRef(0);
  const routeRecoveredUntilTsRef = useRef(0);
  const smoothHeadingRef = useRef(0);
  const rawHeadingRef = useRef<number | null>(null);
  const lastGpsFixTsRef = useRef<number>(Date.now());

  const pushVoiceLog = useCallback(
    (entry: Omit<VoiceLogEntry, 'id' | 'timestamp' | 'routeVersion'>) => {
      const full: VoiceLogEntry = {
        ...entry,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        routeVersion: routeVersionRef.current,
      };
      setVoiceHistory((prev) => [full, ...prev].slice(0, 30));
    },
    []
  );

  // Section 八：將原始 GPS 方向（rawHeadingDeg 供道路匹配與迴轉完成判定）與視覺平滑方向（headingDeg 供 3D 鏡頭）分開處理，
  // 絕不為了讓地圖動畫平滑而延後實際導航決策！
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
      rawHeadingRef.current = incoming.headingDeg;
      smoothHeadingRef.current = lerpAngleDeg(smoothHeadingRef.current, incoming.headingDeg, 0.45);
    }

    setGps({
      ...incoming,
      rawHeadingDeg: rawHeadingRef.current ?? incoming.headingDeg,
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
            timeInterval: 500,
            distanceInterval: 1,
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

  const routeOrigin: Coordinate = useMemo(() => {
    if (customOrigin) {
      return {
        lat: customOrigin.navLat ?? customOrigin.lat,
        lon: customOrigin.navLon ?? customOrigin.lon,
      };
    }
    return effectiveOrigin;
  }, [customOrigin, effectiveOrigin]);

  const isCustomOrigin = Boolean(customOrigin);

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
        originHeadingDeg?: number | null;
        keepNavigating?: boolean;
      }
    ) => {
      setDestination(target);
      setErrorMessage(null);
      const reqVersion = routeVersionRef.current + 1;
      routeVersionRef.current = reqVersion;

      // 路線切換／重新計算時立即取消過期舊語音佇列（Section 三.C & 六）
      voiceAdapter.stop();

      if (!opts?.keepNavigating) {
        setPhase('routing');
        saveRecentSearch(target).then(setRecentPlaces);
      }
      const t0 = Date.now();
      try {
        const usedOrigin = opts?.originOverride ?? routeOrigin;
        const usedHeading =
          opts?.originHeadingDeg !== undefined
            ? opts.originHeadingDeg
            : customOrigin && !opts?.originOverride
            ? null
            : activeGps?.rawHeadingDeg ?? activeGps?.headingDeg ?? null;
        const res = await fetchValhallaRoute({
          origin: usedOrigin,
          originHeadingDeg: usedHeading,
          destination: {
            lat: target.navLat ?? target.lat,
            lon: target.navLon ?? target.lon,
          },
          destinationPlaceId: target.placeId || target.id,
          vehicleType: opts?.vehicleTypeOverride ?? vehicleType,
          avoidTolls: opts?.avoidTolls ?? avoidTolls,
          avoidHighways: opts?.avoidHighways ?? avoidHighways,
        });

        // Section 三.C：請求版本識別，丟棄過期路線結果，避免新舊路線互相覆蓋
        if (reqVersion !== routeVersionRef.current) {
          return null;
        }

        res.requestVersion = reqVersion;
        recordNavDiagnostic('route_ok', res.vehicleType, { latencyMs: Date.now() - t0 });
        lastShapeIndexRef.current = 0;
        lastActiveManeuverIdxRef.current = null;
        lastDistanceToNextTurnRef.current = null;
        spokenKeysRef.current.clear();
        offRouteHitsRef.current = 0;
        wrongWayHitsRef.current = 0;
        offRouteFirstSeenTsRef.current = 0;
        setRerouteOfflinePending(false);
        setRoute(res);
        setProgress(null);
        setPhase(opts?.keepNavigating ? 'navigating' : 'route_preview');
        return res;
      } catch (err: any) {
        if (reqVersion !== routeVersionRef.current) {
          return null;
        }
        recordNavDiagnostic('route_error', 'ROUTE_FAIL', { latencyMs: Date.now() - t0 });
        if (!opts?.keepNavigating) {
          setRoute(null);
          setPhase('idle');
          setErrorMessage(err?.message || '路線規劃失敗，請稍後再試');
        } else {
          // 偏航重算失敗時保留原路線與安全畫面狀態，不繼續播報已失效舊路線指令
          setRerouteOfflinePending(true);
          setPhase('navigating');
          recordNavDiagnostic('reroute_failed_offline', 'KEEP_SAFE_STATE');
        }
        return null;
      }
    },
    [effectiveOrigin, activeGps, vehicleType, avoidTolls, avoidHighways, voiceAdapter]
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
    async (
      currentCoord: Coordinate,
      headingDeg?: number | null,
      reason: 'lateral_off_route' | 'wrong_way' | 'missed_turn' | 'missed_uturn' = 'lateral_off_route'
    ) => {
      if (!destination || isReroutingRef.current) return;
      const now = Date.now();
      if (now - lastRerouteTsRef.current < REROUTE_COOLDOWN_MS) return;

      const detectionLatencyMs =
        offRouteFirstSeenTsRef.current > 0
          ? Math.max(50, now - offRouteFirstSeenTsRef.current)
          : 120;

      isReroutingRef.current = true;
      lastRerouteTsRef.current = now;
      offRouteHitsRef.current = 0;
      wrongWayHitsRef.current = 0;
      offRouteFirstSeenTsRef.current = 0;

      // Section 六：立即取消過期舊語音佇列並進入 REROUTING 狀態
      voiceAdapter.stop();
      setCommandState('REROUTING');
      setPhase('off_route_recalculating');
      recordNavDiagnostic('off_route_reroute', `${reason.toUpperCase()}_${rerouteCount + 1}`);

      const apiT0 = Date.now();
      try {
        const updated = await calculateRoute(destination, {
          originOverride: currentCoord,
          originHeadingDeg:
            headingDeg !== undefined
              ? headingDeg
              : activeGps?.rawHeadingDeg ?? activeGps?.headingDeg ?? null,
          keepNavigating: true,
        });
        const apiLatencyMs = Date.now() - apiT0;

        if (updated) {
          const uiT0 = Date.now();
          setRerouteCount((c) => c + 1);
          setCommandState('ROUTE_RECOVERED');
          routeRecoveredUntilTsRef.current = Date.now() + 2600;

          const firstStep = updated.maneuvers[1] || updated.maneuvers[0];
          const secondStep = updated.maneuvers[2] || null;
          // 計算從目前位置到新路線第一個轉彎／迴轉點的實際路線距離
          const initialDistM = Math.max(
            20,
            Math.round((updated.maneuvers[0]?.distanceKm || firstStep?.distanceKm || 0.15) * 1000)
          );
          const distLabel = formatDistanceMetersZh(initialDistM);

          let announceText = '已重新規劃路線。';
          if (updated.headingUnverified) {
            announceText =
              '已重新規劃路線。目前路段缺乏迴轉限制資料，請依現場標誌繼續直行或於前方合法路口掉頭。';
          } else if (firstStep) {
            const isUTurn = firstStep.type === 12 || firstStep.type === 13;
            if (isUTurn) {
              // Section 五.C：若新路線第一個動作是合法迴轉，第一階段明確告知「前方 X 公尺，請準備迴轉」，絕不先報迴轉後的右轉！
              announceText = `已重新規劃路線，前方 ${distLabel}，請準備迴轉。`;
              spokenKeysRef.current.add(`${firstStep.index}:advance`);
              if (initialDistM <= 260) {
                spokenKeysRef.current.add(`${firstStep.index}:approach`);
              }
            } else {
              // Section 四：尊重駕駛自行選擇的順向道路，直接播報順向新路線的下一個動作
              const shortChain =
                secondStep && firstStep.distanceKm > 0 && firstStep.distanceKm <= 0.09
                  ? `，接著${secondStep.instruction}`
                  : '';
              announceText = `已切換至新路線，前方 ${distLabel}，${firstStep.instruction}${shortChain}。`;
              spokenKeysRef.current.add(`${firstStep.index}:advance`);
              spokenKeysRef.current.add(`${firstStep.index}:transition`);
            }
          }

          voiceAdapter.speak(announceText);
          pushVoiceLog({
            maneuverIndex: firstStep?.index ?? 0,
            stage: 'reroute',
            commandState: 'ROUTE_RECOVERED',
            distanceMeters: initialDistM,
            speedKmh: Math.round((activeGps?.speedMps ?? 0) * 3.6),
            text: announceText,
          });

          const uiUpdateLatencyMs = Math.max(8, Date.now() - uiT0);
          setRerouteMetrics((prev) =>
            [
              {
                id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                timestamp: Date.now(),
                routeVersion: updated.requestVersion ?? routeVersionRef.current,
                reason,
                detectionLatencyMs,
                apiLatencyMs,
                uiUpdateLatencyMs,
                firstManeuverText: announceText,
              },
              ...prev,
            ].slice(0, 20)
          );
        }
      } finally {
        isReroutingRef.current = false;
      }
    },
    [destination, calculateRoute, voiceAdapter, rerouteCount, activeGps, pushVoiceLog]
  );

  // 即時導航進度計算、7 態狀態機、速度感知語音觸發、獨立偏航／逆向／錯過路口偵測與抵達判定
  useEffect(() => {
    if (phase !== 'navigating' || !activeGps || !route || route.coordinates.length < 2) {
      return;
    }

    const decisionHeading = activeGps.rawHeadingDeg ?? activeGps.headingDeg ?? null;
    const snap = computeNavigationProgress(
      { lat: activeGps.lat, lon: activeGps.lon },
      route,
      lastShapeIndexRef.current,
      decisionHeading,
      activeGps.speedMps,
      lastDistanceToNextTurnRef.current,
      lastActiveManeuverIdxRef.current
    );
    lastShapeIndexRef.current = snap.nearestShapeIndex;

    const prevActiveIdx = lastActiveManeuverIdxRef.current;
    const isStepTransition =
      prevActiveIdx !== null &&
      snap.activeManeuverIndex !== prevActiveIdx &&
      snap.activeManeuverIndex > prevActiveIdx;

    lastActiveManeuverIdxRef.current = snap.activeManeuverIndex;
    lastDistanceToNextTurnRef.current = snap.distanceToNextTurnMeters;
    setProgress(snap);

    // 1. 抵達判定
    if (snap.hasArrived) {
      if (simTimerRef.current) {
        clearInterval(simTimerRef.current);
        simTimerRef.current = null;
      }
      setIsSimulating(false);
      setCommandState('ARRIVED');
      setPhase('arrived');
      setFollowMode('free');
      bgLocationAdapter.stop();
      setBgLocationActive(false);
      AsyncStorage.removeItem(ACTIVE_NAV_SESSION_KEY).catch(() => {});
      const arriveText = '已抵達目的地，導航結束。';
      voiceAdapter.speak(arriveText);
      pushVoiceLog({
        maneuverIndex: snap.activeManeuverIndex,
        stage: 'system',
        commandState: 'ARRIVED',
        distanceMeters: 0,
        speedKmh: Math.round((activeGps.speedMps ?? 0) * 3.6),
        text: arriveText,
      });
      return;
    }

    // 若 GPS 精度過差（> 55m），暫不觸發偏航重算或轉彎語音，防止單點漂移誤判（Section 三.A & 十.10）
    const accuracyOk = (activeGps.accuracyMeters ?? 12) <= 55;
    if (!accuracyOk && !isSimulating) {
      return;
    }

    // 2. Section 三 & 五.D：獨立偏航偵測器（綜合橫向偏離 > 25m、逆向行駛 > 110°、錯過轉彎或經過迴轉點未迴轉）
    if (!isSimulating) {
      // (A) 錯過轉彎或錯過迴轉位置：立即取消過期語音並順向重新計算新路線
      if (snap.isMissedManeuver) {
        if (offRouteFirstSeenTsRef.current === 0) {
          offRouteFirstSeenTsRef.current = Date.now();
        }
        voiceAdapter.stop();
        setCommandState('OFF_ROUTE');
        const wasUTurn =
          snap.nextManeuver?.type === 12 || snap.nextManeuver?.type === 13;
        triggerOffRouteReroute(
          { lat: activeGps.lat, lon: activeGps.lon },
          decisionHeading,
          wasUTurn ? 'missed_uturn' : 'missed_turn'
        );
        return;
      }

      // (B) 橫向偏離原路線 > 25m（駕駛主動選走其他道路）
      if (snap.distanceToRouteMeters > OFF_ROUTE_THRESHOLD_METERS) {
        if (offRouteHitsRef.current === 0 && offRouteFirstSeenTsRef.current === 0) {
          offRouteFirstSeenTsRef.current = Date.now();
        }
        offRouteHitsRef.current += 1;
        setCommandState('OFF_ROUTE');
        voiceAdapter.stop();
        // 當偏離超過 42m 且車速 >= 4 m/s 時立即確認；否則連續 2 筆（約 1 秒）確認，兼顧抗漂移與 1~2 秒極速反應
        const immediateLateralConfirm =
          snap.distanceToRouteMeters >= 42 &&
          (activeGps.speedMps ?? 0) >= 4.0 &&
          (activeGps.accuracyMeters ?? 12) <= 25;
        if (
          immediateLateralConfirm ||
          offRouteHitsRef.current >= OFF_ROUTE_CONSECUTIVE_HITS
        ) {
          triggerOffRouteReroute(
            { lat: activeGps.lat, lon: activeGps.lon },
            decisionHeading,
            'lateral_off_route'
          );
          return;
        }
        return;
      } else {
        offRouteHitsRef.current = 0;
      }

      // (C) 在同一條路上逆向行駛（如林口信義路往西北開，而原路線往東南走）：連續 2 筆（約 1 秒）立即觸發順向重算
      if (snap.isWrongWay) {
        if (wrongWayHitsRef.current === 0 && offRouteFirstSeenTsRef.current === 0) {
          offRouteFirstSeenTsRef.current = Date.now();
        }
        wrongWayHitsRef.current += 1;
        setCommandState('OFF_ROUTE');
        voiceAdapter.stop();
        if (wrongWayHitsRef.current >= WRONG_WAY_CONSECUTIVE_HITS) {
          triggerOffRouteReroute(
            { lat: activeGps.lat, lon: activeGps.lon },
            decisionHeading,
            'wrong_way'
          );
          return;
        }
        return;
      } else {
        wrongWayHitsRef.current = 0;
      }

      if (offRouteHitsRef.current === 0 && wrongWayHitsRef.current === 0) {
        offRouteFirstSeenTsRef.current = 0;
        if (rerouteOfflinePending) setRerouteOfflinePending(false);
      }
    }

    // 更新導航指令狀態機（若剛完成重算 2.6 秒內保持顯示 ROUTE_RECOVERED）
    const nextCmdState: NavCommandState =
      Date.now() < routeRecoveredUntilTsRef.current
        ? 'ROUTE_RECOVERED'
        : snap.commandState;
    setCommandState(nextCmdState);

    // 若正處於離線重算失敗等待中，不繼續播報已失效舊路線的轉彎指示（Section 三.C）
    if (rerouteOfflinePending) {
      return;
    }

    // 3. 速度感知三階段語音與轉彎／迴轉完成後下一步立即播報
    const announcement = pickVoiceAnnouncement(
      snap.nextManeuver,
      snap.thenManeuver,
      snap.distanceToNextTurnMeters,
      activeGps.speedMps,
      spokenKeysRef.current,
      isStepTransition
    );
    if (announcement) {
      spokenKeysRef.current.add(announcement.key);
      voiceAdapter.speak(announcement.text);
      pushVoiceLog({
        maneuverIndex: snap.nextManeuver?.index ?? 0,
        stage: announcement.stage,
        commandState: nextCmdState,
        distanceMeters: snap.distanceToNextTurnMeters,
        speedKmh: Math.round((activeGps.speedMps ?? 0) * 3.6),
        text: announcement.text,
      });
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
    pushVoiceLog,
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
    const initialDistM = Math.max(20, Math.round((startStep?.distanceKm || 0.2) * 1000));
    const distLabel = formatDistanceMetersZh(initialDistM);
    let firstPrompt = startStep?.instruction || '';
    if (nextStep) {
      if (nextStep.type === 12 || nextStep.type === 13) {
        firstPrompt = `前方 ${distLabel}，請準備迴轉。`;
        spokenKeysRef.current.add(`${nextStep.index}:advance`);
      } else {
        firstPrompt = `前方 ${distLabel}，${nextStep.instruction}。`;
        spokenKeysRef.current.add(`${nextStep.index}:advance`);
      }
    }
    const startVoiceText = `開始導航，全程 ${route.distanceKm.toFixed(1)} 公里，預計 ${mins} 分鐘。${firstPrompt}`;
    setCommandState('FOLLOWING_ROUTE');
    voiceAdapter.speak(startVoiceText);
    pushVoiceLog({
      maneuverIndex: nextStep?.index ?? 0,
      stage: 'system',
      commandState: 'FOLLOWING_ROUTE',
      distanceMeters: initialDistM,
      speedKmh: 0,
      text: startVoiceText,
    });
  }, [
    route,
    destination,
    vehicleType,
    avoidTolls,
    avoidHighways,
    bgLocationAdapter,
    voiceAdapter,
    pushVoiceLog,
  ]);

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

  const setCustomOrigin = useCallback(
    async (place: SearchPlace | null) => {
      setCustomOriginState(place);
      if (destination) {
        const nextOrigin: Coordinate = place
          ? { lat: place.navLat ?? place.lat, lon: place.navLon ?? place.lon }
          : effectiveOrigin;
        await calculateRoute(destination, {
          originOverride: nextOrigin,
          originHeadingDeg: place ? null : activeGps?.rawHeadingDeg ?? activeGps?.headingDeg ?? null,
        });
      }
    },
    [destination, effectiveOrigin, activeGps, calculateRoute]
  );

  const swapOriginAndDestination = useCallback(async () => {
    if (!destination) return;
    const prevOriginAsPlace: SearchPlace = customOrigin ?? {
      id: `gps-origin-${effectiveOrigin.lat.toFixed(5)}-${effectiveOrigin.lon.toFixed(5)}`,
      name: '目前位置',
      address: `${effectiveOrigin.lat.toFixed(5)}, ${effectiveOrigin.lon.toFixed(5)}`,
      lat: effectiveOrigin.lat,
      lon: effectiveOrigin.lon,
      category: '目前位置',
    };
    const nextOriginPlace = destination;
    const nextDestPlace = prevOriginAsPlace;
    setCustomOriginState(nextOriginPlace);
    await calculateRoute(nextDestPlace, {
      originOverride: {
        lat: nextOriginPlace.navLat ?? nextOriginPlace.lat,
        lon: nextOriginPlace.navLon ?? nextOriginPlace.lon,
      },
      originHeadingDeg: null,
    });
  }, [destination, customOrigin, effectiveOrigin, calculateRoute]);

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
    routeOrigin,
    customOrigin,
    isCustomOrigin,
    setCustomOrigin,
    swapOriginAndDestination,
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
    commandState,
    voiceHistory,
    rerouteMetrics,
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
