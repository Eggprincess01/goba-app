import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Appearance,
  Image,
  Keyboard,
  LayoutAnimation,
  Linking,
  Modal,
  PanResponder,
  Platform,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Speech from 'expo-speech';
import { Ionicons } from '@expo/vector-icons';
import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map,
  type MapRef,
  Marker,
  type TrackUserLocation,
  UserLocation,
} from '@maplibre/maplibre-react-native';
import { LiquidGlassSurface } from '../components/LiquidGlassSurface';
import { ManeuverArrowIcon } from '../components/ManeuverArrowIcon';
import { HdRoadLayers } from '../components/navigation/HdRoadLayers';
import { NavHudOverlay } from '../components/navigation/NavHudOverlay';
import {
  SpeedCameraAlertBanner,
  type ActiveSpeedCameraAlert,
} from '../components/navigation/SpeedCameraAlertBanner';
import { RouteProgressBar } from '../components/navigation/RouteProgressBar';
import { FleetModal } from '../components/navigation/FleetModal';
import { ExtrasModal } from '../components/navigation/ExtrasModal';
import { useFleetMode } from '../navigation/fleet';
import {
  appendTripRecord,
  CAMERA_ALERT_LEAD_OPTIONS,
  clearParkingSpot,
  CommunityCategory,
  CommunityReport,
  createTripShare,
  fetchCommunityReports,
  fetchSpeedCameras,
  loadCameraAlertLeadMeters,
  loadNavCursorSkin,
  loadSavedParking,
  loadTripHistory,
  NAV_CURSOR_SKINS,
  NavCursorSkin,
  parseGobaVoiceCommand,
  revokeTripShare,
  saveCameraAlertLeadMeters,
  SavedParkingSpot,
  saveNavCursorSkin,
  saveParkingSpot,
  SpeedCameraNode,
  submitCommunityReport,
  TripRecord,
  TripTrackPoint,
  updateTripShare,
  voteCommunityReport,
} from '../navigation/extras';
import { OpeningHoursPicker } from '../components/OpeningHoursPicker';
import { recordNavDiagnostic } from '../navigation/diagnostics';
import type { ReplayScenarioResult } from '../navigation/gpsReplayTester';
import {
  getEffectiveMapStyleUrl,
  MAP_STYLE_OPTIONS,
  MapThemePreference,
  resolveAutoMapTheme,
} from '../navigation/mapStyle';
import { formatDistanceMetersZh, splitRouteCoords } from '../navigation/navEngine';
import {
  Coordinate,
  HdRoadsPayload,
  SearchPlace,
  TrafficSignalNode,
  TransitBusStop,
  YouBikeStation,
} from '../navigation/types';
import { useNavigationState } from '../navigation/useNavigationState';
import {
  type AddressGeocodeCandidate,
  type ViewportPoi,
  fetchAdminFeedbackQueue,
  fetchHdRoadsNear,
  fetchPlaceDetailById,
  fetchTrafficSignalsNear,
  fetchTransitStopsNear,
  fetchViewportPois,
  fetchYouBikeNear,
  formatDurationZh,
  formatEtaTime,
  geocodeTaiwanAddress,
  getManeuverIconName,
  mapApiPerfCounters,
  reverseGeocodeLocation,
  reviewAdminFeedback,
  searchUnifiedPlaces,
  submitPlaceErrorFeedback,
} from '../navigation/valhalla';
import { DISPLAY_VEHICLE_PROFILES, getVehicleProfile } from '../navigation/vehicleRestrictions';
import { haversineKm } from '../services/api';

const GOBA_MASCOT = require('../assets/icon-small.png');

const VIEWPORT_POI_STYLE: Record<string, { icon: string; color: string }> = {
  attraction: { icon: 'star', color: '#EC4899' },
  scenic: { icon: 'image', color: '#10B981' },
  mall: { icon: 'bag-handle', color: '#A855F7' },
  hospital: { icon: 'medkit', color: '#EF4444' },
  clinic: { icon: 'medkit', color: '#F43F5E' },
  pharmacy: { icon: 'medical', color: '#10B981' },
  gas_station: { icon: 'flame', color: '#F97316' },
  charging_station: { icon: 'flash', color: '#06B6D4' },
  parking: { icon: 'car', color: '#3B82F6' },
  convenience_store: { icon: 'storefront', color: '#14B8A6' },
  supermarket: { icon: 'cart', color: '#16A34A' },
  restaurant: { icon: 'restaurant', color: '#EA580C' },
  beverage: { icon: 'wine', color: '#EC4899' },
  cafe: { icon: 'cafe', color: '#92400E' },
  school: { icon: 'school', color: '#6366F1' },
  library: { icon: 'book', color: '#4F46E5' },
  bank: { icon: 'cash', color: '#0EA5E9' },
  atm: { icon: 'card', color: '#0284C7' },
  park: { icon: 'leaf', color: '#22C55E' },
  hotel: { icon: 'bed', color: '#8B5CF6' },
  post_office: { icon: 'mail', color: '#059669' },
  temple: { icon: 'sparkles', color: '#D97706' },
  government: { icon: 'business', color: '#475569' },
  police: { icon: 'shield-checkmark', color: '#1D4ED8' },
  market: { icon: 'basket', color: '#F59E0B' },
  sports: { icon: 'fitness', color: '#0D9488' },
  transit: { icon: 'train', color: '#2563EB' },
  car_service: { icon: 'build', color: '#64748B' },
  shop: { icon: 'pricetag', color: '#DB2777' },
  entertainment: { icon: 'film', color: '#9333EA' },
};

const QUICK_POI_CATEGORIES = [
  { label: '加油站', query: '加油站', categoryId: 'gas_station', icon: 'flame-outline' },
  { label: '停車場', query: '停車場', categoryId: 'parking', icon: 'car-outline' },
  { label: '超商', query: '便利商店', categoryId: 'convenience_store', icon: 'storefront-outline' },
  { label: '美食', query: '餐廳', categoryId: 'restaurant', icon: 'restaurant-outline' },
  { label: '充電站', query: '充電站', categoryId: 'charging_station', icon: 'flash-outline' },
  { label: 'YouBike', query: 'YouBike', categoryId: 'youbike', icon: 'bicycle-outline' },
  { label: '捷運', query: '捷運站', categoryId: 'transit_station', icon: 'train-outline' },
  { label: '醫院', query: '醫院', categoryId: 'hospital', icon: 'medkit-outline' },
];

const COCKPIT_CAMERA_PADDING = { top: 265, right: 0, bottom: 30, left: 0 };

/**
 * 四大明確操作狀態：
 * - browse: 一般瀏覽地圖（含點擊地點詳細資訊卡）
 * - search: 搜尋目的地專頁（含住家、公司、收藏、最近搜尋）
 * - route_preview: 路線預覽及車種選擇
 * - navigation: 正式導航（隱藏非必要控制項，切換導航專用底圖與下一路口高亮）
 */
type MapUiState = 'browse' | 'search' | 'route_preview' | 'navigation';

export interface NavigationScreenProps {
  initialCenter: Coordinate;
  initialDestination?: SearchPlace | null;
  embeddedInTab?: boolean;
  openFleetTrigger?: number;
  weatherTemp?: number | null;
  onTabBarVisibilityChange?: (visible: boolean) => void;
  onClose: () => void;
}

export const NavigationScreen: React.FC<NavigationScreenProps> = ({
  initialCenter,
  initialDestination = null,
  embeddedInTab = false,
  openFleetTrigger = 0,
  weatherTemp = null,
  onTabBarVisibilityChange,
  onClose,
}) => {
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const searchInputRef = useRef<any>(null);

  const nav = useNavigationState(initialCenter);
  const fleetState = useFleetMode({ gps: nav.gps, vehicleType: nav.vehicleType });
  const [fleetModalOpen, setFleetModalOpen] = useState(false);
  const [liveTransitEta, setLiveTransitEta] = useState<{
    liveAvailable: boolean;
    source: string;
    routes: { route_name: string; direction: string; eta_text: string }[];
  } | null>(null);

  useEffect(() => {
    if (openFleetTrigger > 0) {
      setFleetModalOpen(true);
    }
  }, [openFleetTrigger]);
  const [extrasModalOpen, setExtrasModalOpen] = useState(false);
  const [cursorSkin, setCursorSkin] = useState<NavCursorSkin>('arrow');
  const [savedParking, setSavedParking] = useState<SavedParkingSpot | null>(null);
  const [tripHistory, setTripHistory] = useState<TripRecord[]>([]);
  const [communityReports, setCommunityReports] = useState<CommunityReport[]>([]);
  const [speedCameras, setSpeedCameras] = useState<SpeedCameraNode[]>([]);
  const [shendunEnabled, setShendunEnabled] = useState(true);
  const [cameraLeadM, setCameraLeadM] = useState<number>(300);
  const [activeCameraAlert, setActiveCameraAlert] = useState<ActiveSpeedCameraAlert | null>(null);
  const announcedCamsRef = useRef<
    Record<
      string,
      { tierInitial?: boolean; speakingIntro?: boolean; tier200?: boolean; tier100?: boolean; tierPass?: boolean }
    >
  >({});
  const latestCamSnapshotRef = useRef<{ id: string; distM: number; isOverspeed: boolean } | null>(null);
  const redPulseAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!activeCameraAlert) {
      redPulseAnim.setValue(0);
      return;
    }
    const duration = activeCameraAlert.isOverspeed ? 380 : 750;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(redPulseAnim, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(redPulseAnim, { toValue: 0.25, duration, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [Boolean(activeCameraAlert), activeCameraAlert?.isOverspeed, redPulseAnim]);
  const [tripShareToken, setTripShareToken] = useState<string | null>(null);
  const [tripShareUrl, setTripShareUrl] = useState<string | null>(null);
  const tripTrackRef = useRef<{
    startedAt: number;
    destName: string;
    points: TripTrackPoint[];
    movingSec: number;
    stoppedSec: number;
    lastTickTs: number;
  } | null>(null);

  useEffect(() => {
    loadNavCursorSkin().then(setCursorSkin);
    loadSavedParking().then(setSavedParking);
    loadTripHistory().then(setTripHistory);
    loadCameraAlertLeadMeters().then(setCameraLeadM);
  }, []);

  // 若從交通地圖分頁直接點擊某站點的「導航」，自動帶入該站點並進入路線預覽
  const initialDestAppliedRef = useRef(false);
  useEffect(() => {
    if (initialDestination && !initialDestAppliedRef.current) {
      initialDestAppliedRef.current = true;
      nav.setInspectedPlace(initialDestination);
      nav.calculateRoute(initialDestination);
    }
  }, [initialDestination]);

  const [themePref, setThemePref] = useState<MapThemePreference>('auto');
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark' | null>(
    Appearance.getColorScheme() ?? 'light'
  );
  const [useFallbackStyle, setUseFallbackStyle] = useState(false);
  const [addingWaypointMode, setAddingWaypointMode] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [bindingAnchorSlot, setBindingAnchorSlot] = useState<'home' | 'work' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchPlace[]>([]);
  const [searchBasis, setSearchBasis] = useState<string>('目前 GPS 位置');
  const [searchLatencyMs, setSearchLatencyMs] = useState<number | null>(null);
  const [nearbyPins, setNearbyPins] = useState<SearchPlace[]>([]);
  const [activePoiCat, setActivePoiCat] = useState<string | null>(null);
  const [mapMovedCenter, setMapMovedCenter] = useState<Coordinate | null>(null);
  const [showSearchAreaBtn, setShowSearchAreaBtn] = useState(false);
  const [sheetCollapsed, setSheetCollapsed] = useState(false);
  const [showManeuvers, setShowManeuvers] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const [adminQueue, setAdminQueue] = useState<any[]>([]);
  const [replayResults, setReplayResults] = useState<ReplayScenarioResult[]>([]);
  const [viewportSignals, setViewportSignals] = useState<TrafficSignalNode[]>([]);
  const [showTrafficSignals, setShowTrafficSignals] = useState(true);
  const [hdRoads, setHdRoads] = useState<HdRoadsPayload | null>(null);
  // Section 5：預留未來合法即時路況圖層槽位（無合法路況來源時嚴格維持 null，絕不將道路邊界塗綠假裝順暢）
  const [liveTrafficGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [feedbackTargetPlace, setFeedbackTargetPlace] = useState<SearchPlace | null>(null);
  const [feedbackIssueType, setFeedbackIssueType] = useState<
    'address_wrong' | 'relocated' | 'closed' | 'name_wrong' | 'duplicate' | 'missing_place' | 'other'
  >('relocated');
  const [feedbackName, setFeedbackName] = useState('');
  const [feedbackAddress, setFeedbackAddress] = useState('');
  const [feedbackPhone, setFeedbackPhone] = useState('');
  const [feedbackHours, setFeedbackHours] = useState('');
  const [feedbackNote, setFeedbackNote] = useState('');
  const [feedbackLat, setFeedbackLat] = useState<number | null>(null);
  const [feedbackLon, setFeedbackLon] = useState<number | null>(null);
  const [feedbackGeoCandidates, setFeedbackGeoCandidates] = useState<AddressGeocodeCandidate[]>([]);
  const [feedbackGeocoding, setFeedbackGeocoding] = useState(false);
  const [feedbackManualPin, setFeedbackManualPin] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [overlappingCandidates, setOverlappingCandidates] = useState<SearchPlace[]>([]);
  // P3 #4：地圖預設啟用 3D 建築與立體高架道路（低縮放層級自動簡化以維持效能，不再需要右側 2D/3D 切換鈕）
  const [is3D, setIs3D] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(14.5);
  const [mapFirstLoadMs, setMapFirstLoadMs] = useState<number | null>(null);
  const [toggle2D3DMs, setToggle2D3DMs] = useState<number | null>(null);

  // P1 #1：分類搜尋底部多筆結果清單與篩選狀態（絕不自動選取第一筆或跳轉路線預覽）
  const [categoryListOpen, setCategoryListOpen] = useState(false);
  const [categoryFilterOpenNow, setCategoryFilterOpenNow] = useState(false);
  const [categorySortBy, setCategorySortBy] = useState<'distance' | 'relevance'>('distance');
  const [categoryBrandFilter, setCategoryBrandFilter] = useState<string>('全部');

  // P1 #8：自訂導航起點搜尋模式
  const [editingOriginMode, setEditingOriginMode] = useState(false);

  // P2 #10 & #11：可互動公車站牌與 YouBike 2.0 / 2.0E 即時站點狀態
  const [youBikeStations, setYouBikeStations] = useState<YouBikeStation[]>([]);
  const [youBikeLiveAvailable, setYouBikeLiveAvailable] = useState(true);
  const [youBikeStatusMsg, setYouBikeStatusMsg] = useState<string | null>(null);
  const [selectedYouBike, setSelectedYouBike] = useState<YouBikeStation | null>(null);
  const [transitStops, setTransitStops] = useState<TransitBusStop[]>([]);
  const [selectedTransitStop, setSelectedTransitStop] = useState<TransitBusStop | null>(null);
  const [viewportPois, setViewportPois] = useState<ViewportPoi[]>([]);

  useEffect(() => {
    if (!selectedTransitStop) {
      setLiveTransitEta(null);
      return;
    }
    let active = true;
    const url = `https://mmlovenn.com/api/maps/transit-stop-eta?lat=${selectedTransitStop.lat}&lon=${selectedTransitStop.lon}&name=${encodeURIComponent(selectedTransitStop.name)}`;
    fetch(url)
      .then((r) => r.json())
      .then((json) => {
        if (active && json?.status === 'ok') {
          setLiveTransitEta({
            liveAvailable: Boolean(json.live_available),
            source: String(json.source || ''),
            routes: Array.isArray(json.routes) ? json.routes : [],
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [selectedTransitStop?.id]);

  const mapMountTsRef = useRef(Date.now());
  const categoryReqSeqRef = useRef(0);
  const lastCameraPushRef = useRef(0);
  const lastMarkerTapTsRef = useRef(0);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      setSystemScheme(colorScheme ?? 'light');
    });
    return () => sub.remove();
  }, []);

  const isActiveNav =
    nav.phase === 'navigating' ||
    nav.phase === 'paused' ||
    nav.phase === 'off_route_recalculating';

  // 明確推導四大 UI 狀態
  const uiState: MapUiState = useMemo(() => {
    if (isActiveNav || nav.phase === 'arrived') return 'navigation';
    if (isSearchOpen) return 'search';
    if (nav.phase === 'routing' || nav.phase === 'route_preview' || nav.route) {
      return 'route_preview';
    }
    return 'browse';
  }, [isActiveNav, nav.phase, isSearchOpen, nav.route]);

  useEffect(() => {
    if (embeddedInTab && onTabBarVisibilityChange) {
      onTabBarVisibilityChange(uiState === 'browse');
    }
  }, [embeddedInTab, onTabBarVisibilityChange, uiState]);

  const resolvedMapTheme = useMemo(
    () =>
      resolveAutoMapTheme({
        preference: themePref,
        isNavigating: uiState === 'navigation',
        systemColorScheme: systemScheme,
        lat: nav.effectiveOrigin.lat,
        lon: nav.effectiveOrigin.lon,
      }),
    [themePref, uiState, systemScheme, nav.effectiveOrigin.lat, nav.effectiveOrigin.lon]
  );

  const currentMapStyle =
    MAP_STYLE_OPTIONS.find((item) => item.id === resolvedMapTheme) || MAP_STYLE_OPTIONS[0];
  const isNight = Boolean(currentMapStyle.isNight);
  const isPinkTheme = resolvedMapTheme === 'pink';

  const cycleThemePref = useCallback(() => {
    const order: MapThemePreference[] = ['auto', 'day', 'night', 'pink'];
    setThemePref((prev) => order[(order.indexOf(prev) + 1) % order.length]);
  }, []);

  const themePrefLabel =
    themePref === 'auto'
      ? `自動 (${currentMapStyle.label})`
      : currentMapStyle.label;

  const effectiveStyleUrl = useMemo(
    () => getEffectiveMapStyleUrl(resolvedMapTheme, uiState === 'navigation', useFallbackStyle),
    [resolvedMapTheme, uiState, useFallbackStyle]
  );

  const activeProfile = getVehicleProfile(nav.vehicleType);

  const isPlaceFavorite = useCallback(
    (place: SearchPlace | null) => {
      if (!place) return false;
      return nav.favoritePlaces.some(
        (f) => f.name === place.name && Math.abs(f.lat - place.lat) < 0.001
      );
    },
    [nav.favoritePlaces]
  );

  const mapLibreTrackMode: TrackUserLocation | undefined = useMemo(() => {
    if (uiState === 'navigation' || nav.isSimulating) return undefined;
    if (nav.followMode === 'follow') return 'default';
    if (nav.followMode === 'heading') return 'heading';
    if (nav.followMode === 'course') return 'course';
    return undefined;
  }, [nav.followMode, nav.isSimulating, uiState]);

  const { passedGeoJSON, remainingGeoJSON } = useMemo(() => {
    if (!nav.route || nav.route.coordinates.length < 2) {
      return { passedGeoJSON: null, remainingGeoJSON: null };
    }
    if (isActiveNav && nav.progress) {
      const { passed, remaining } = splitRouteCoords(
        nav.route.coordinates,
        nav.progress.snappedCoord,
        nav.progress.nearestShapeIndex
      );
      return {
        passedGeoJSON:
          passed.length >= 2
            ? ({
                type: 'FeatureCollection',
                features: [
                  {
                    type: 'Feature',
                    properties: {},
                    geometry: { type: 'LineString', coordinates: passed },
                  },
                ],
              } as GeoJSON.FeatureCollection)
            : null,
        remainingGeoJSON:
          remaining.length >= 2
            ? ({
                type: 'FeatureCollection',
                features: [
                  {
                    type: 'Feature',
                    properties: {},
                    geometry: { type: 'LineString', coordinates: remaining },
                  },
                ],
              } as GeoJSON.FeatureCollection)
            : null,
      };
    }
    return {
      passedGeoJSON: null,
      remainingGeoJSON: {
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { vehicleType: nav.route.vehicleType },
            geometry: {
              type: 'LineString',
              coordinates: nav.route.coordinates,
            },
          },
        ],
      } as GeoJSON.FeatureCollection,
    };
  }, [nav.route, isActiveNav, nav.progress?.snappedCoord?.[0], nav.progress?.snappedCoord?.[1]]);

  // 路線預覽自動縮放涵蓋整條路線
  useEffect(() => {
    if (nav.route && nav.phase === 'route_preview') {
      const [west, south, east, north] = nav.route.bbox;
      nav.setFollowMode('free');
      setIs3D(false);
      setSheetCollapsed(false);
      setTimeout(() => {
        cameraRef.current?.fitBounds([west, south, east, north], {
          padding: { top: 140, right: 48, bottom: 320, left: 48 },
          pitch: 0,
          bearing: 0,
          duration: 700,
        });
      }, 120);
    }
  }, [nav.route?.fetchedAt, nav.phase]);

  // 定期更新可視範圍社群交通回報與 OSM 測速照相點位
  useEffect(() => {
    let active = true;
    const center = mapMovedCenter || nav.effectiveOrigin;
    fetchCommunityReports(center.lat, center.lon).then((list) => {
      if (active) setCommunityReports(list);
    });
    if (zoomLevel >= 12.5 || isActiveNav || nav.speedKmh >= 12) {
      const span = 0.06;
      fetchSpeedCameras({
        minLat: center.lat - span,
        minLon: center.lon - span,
        maxLat: center.lat + span,
        maxLon: center.lon + span,
      }).then((res) => {
        if (active) setSpeedCameras(res.cameras);
      });
    }
    return () => {
      active = false;
    };
  }, [mapMovedCenter?.lat, mapMovedCenter?.lon, nav.effectiveOrigin.lat, nav.effectiveOrigin.lon, zoomLevel >= 12.5, isActiveNav, nav.speedKmh >= 12]);

  // 神盾級測速與科技執法即時偵測（僅在行駛中且確實在車頭前方同車道／路線上才警示，杜絕靜止或平行道路誤報）
  useEffect(() => {
    if (!shendunEnabled || !nav.gps || speedCameras.length === 0) {
      setActiveCameraAlert(null);
      return;
    }
    const { lat, lon, headingDeg } = nav.gps;
    const speedKmh = nav.speedKmh;
    const minTriggerSpeed = isActiveNav ? 8 : 15;
    if (speedKmh < minTriggerSpeed) {
      setActiveCameraAlert(null);
      return;
    }

    const toRad = (d: number) => (d * Math.PI) / 180;
    const calcBearing = (lat1: number, lon1: number, lat2: number, lon2: number) => {
      const dLon = toRad(lon2 - lon1);
      const y = Math.sin(dLon) * Math.cos(toRad(lat2));
      const x =
        Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
        Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
      return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    };
    const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

    const routeCoords = isActiveNav ? nav.route?.coordinates : undefined;
    const isNearRoute = (clat: number, clon: number) => {
      if (!routeCoords || routeCoords.length === 0) return true;
      for (let i = 0; i < routeCoords.length; i += 2) {
        const [rlon, rlat] = routeCoords[i];
        if (Math.abs(rlat - clat) < 0.0006 && Math.abs(rlon - clon) < 0.0006) {
          if (haversineKm(rlat, rlon, clat, clon) * 1000 <= 45) return true;
        }
      }
      return false;
    };

    const maxDetectM = Math.min(950, Math.max(350, cameraLeadM + 350));

    let bestCam: SpeedCameraNode | null = null;
    let bestDistM = Infinity;

    for (const cam of speedCameras) {
      const distM = haversineKm(lat, lon, cam.lat, cam.lon) * 1000;
      if (distM > maxDetectM) continue;

      const rec = announcedCamsRef.current[cam.id];
      if (headingDeg != null) {
        const bearingToCam = calcBearing(lat, lon, cam.lat, cam.lon);
        const fwdDiff = angleDiff(headingDeg, bearingToCam);
        // 若先前已預警過該測速點，且現在已實際通過（位於車尾後方 >= 95° 且距離 <= 70m，或距離 <= 12m），才播報「通過」
        if (rec?.tierInitial && !rec.tierPass && ((fwdDiff >= 95 && distM <= 70) || distM <= 12)) {
          rec.tierPass = true;
          announcedCamsRef.current[cam.id] = rec;
          if (nav.voiceEnabled) {
            Speech.speak('通過', { language: 'zh-TW', rate: 0.92 });
          }
          continue;
        }
        const crossTrackM = distM * Math.sin(toRad(fwdDiff));
        // 必須在車頭前方 32° 錐形內，且橫向偏離 <= 45 公尺（過濾平行道路如隔壁文化北路）
        if (distM > 15 && (fwdDiff > 32 || crossTrackM > 45)) {
          continue;
        }
        if (typeof cam.bearing_deg === 'number' && angleDiff(headingDeg, cam.bearing_deg) > 55) {
          continue; // 拍攝方向為對向車道，過濾不誤報
        }
      } else if (rec?.tierInitial && !rec.tierPass && distM <= 12) {
        rec.tierPass = true;
        announcedCamsRef.current[cam.id] = rec;
        if (nav.voiceEnabled) {
          Speech.speak('通過', { language: 'zh-TW', rate: 0.92 });
        }
        continue;
      }

      if (rec?.tierPass) {
        continue; // 已通過的測速點不再重複警示
      }

      if (isActiveNav && !isNearRoute(cam.lat, cam.lon)) {
        continue; // 導航模式下只報規劃路線上的測速點
      }

      if (distM < bestDistM) {
        bestDistM = distM;
        bestCam = cam;
      }
    }

    if (!bestCam) {
      latestCamSnapshotRef.current = null;
      setActiveCameraAlert(null);
      return;
    }

    const limit = bestCam.speed_limit_kmh;
    const isOverspeed = typeof limit === 'number' && limit > 0 && speedKmh > limit + 4;
    const speedBoost = speedKmh > 60 ? (speedKmh - 60) * 4 : 0;
    const limitBoost = typeof limit === 'number' && limit >= 80 ? 120 : 0;
    const overspeedBoost = isOverspeed ? 80 : 0;
    const effectiveLeadM = Math.min(900, Math.max(300, cameraLeadM + speedBoost + limitBoost + overspeedBoost));

    if (bestDistM > effectiveLeadM + 20) {
      latestCamSnapshotRef.current = null;
      setActiveCameraAlert(null);
      return;
    }

    latestCamSnapshotRef.current = { id: bestCam.id, distM: bestDistM, isOverspeed };
    setActiveCameraAlert({ camera: bestCam, distanceM: bestDistM, isOverspeed });

    if (nav.voiceEnabled) {
      const camId = bestCam.id;
      const rec = announcedCamsRef.current[camId] || {};
      const typeLabel =
        bestCam.camera_type === 'section'
          ? '區間測速照相'
          : bestCam.camera_type === 'tech_enforcement'
          ? '科技執法'
          : '固定式測速照相';
      const limitPart = typeof limit === 'number' && limit > 0 ? `，限速${limit}公里` : '';
      const overspeedPart = isOverspeed ? '，您已超速' : '';

      if (bestDistM <= effectiveLeadM && bestDistM > 215 && !rec.tierInitial) {
        rec.tierInitial = true;
        rec.speakingIntro = true;
        announcedCamsRef.current[camId] = rec;
        if (isOverspeed) Vibration.vibrate([0, 120, 80, 120]);
        Speech.speak(`${typeLabel}${limitPart}${overspeedPart}`, {
          language: 'zh-TW',
          rate: 0.92,
          onDone: () => {
            rec.speakingIntro = false;
            setTimeout(() => {
              const snap = latestCamSnapshotRef.current;
              if (!snap || snap.id !== camId || snap.distM <= 120 || rec.tierPass) return;
              const liveDist =
                snap.distM >= 250
                  ? Math.round(snap.distM / 50) * 50
                  : Math.round(snap.distM / 10) * 10;
              if (snap.distM <= 225) rec.tier200 = true;
              Speech.speak(`${liveDist}公尺`, { language: 'zh-TW', rate: 0.92 });
            }, 220);
          },
          onStopped: () => {
            rec.speakingIntro = false;
          },
          onError: () => {
            rec.speakingIntro = false;
          },
        });
      } else if (!rec.speakingIntro && bestDistM <= 215 && bestDistM > 120 && !rec.tier200) {
        const firstTime = !rec.tierInitial;
        rec.tierInitial = true;
        rec.tier200 = true;
        announcedCamsRef.current[camId] = rec;
        if (isOverspeed) Vibration.vibrate([0, 140, 80, 140]);
        Speech.speak(
          firstTime ? `${typeLabel}${limitPart}，200公尺${overspeedPart}` : `200公尺${overspeedPart}`,
          { language: 'zh-TW', rate: 0.92 }
        );
      } else if (!rec.speakingIntro && bestDistM <= 120 && bestDistM > 12 && !rec.tier100) {
        rec.tierInitial = true;
        rec.tier200 = true;
        rec.tier100 = true;
        announcedCamsRef.current[camId] = rec;
        Vibration.vibrate([0, 90]);
        Speech.speak(`100公尺${overspeedPart}`, { language: 'zh-TW', rate: 0.92 });
      }
    }
  }, [shendunEnabled, cameraLeadM, isActiveNav, nav.route?.coordinates, nav.gps?.lat, nav.gps?.lon, nav.gps?.headingDeg, nav.speedKmh, nav.voiceEnabled, speedCameras]);

  // 導航中自動記錄 GPX 軌跡與統計移動/停止時間，結束時自動存檔；並同步旅程分享連結
  useEffect(() => {
    if (isActiveNav && nav.gps) {
      const now = Date.now();
      const speedKmh = nav.gps.speedMps != null ? Math.max(0, nav.gps.speedMps * 3.6) : 0;
      if (!tripTrackRef.current) {
        tripTrackRef.current = {
          startedAt: now,
          destName: nav.destination?.name || '目的地',
          points: [{ lat: nav.gps.lat, lon: nav.gps.lon, ts: now, speedKmh }],
          movingSec: 0,
          stoppedSec: 0,
          lastTickTs: now,
        };
      } else {
        const dtSec = Math.max(0, Math.min(10, (now - tripTrackRef.current.lastTickTs) / 1000));
        tripTrackRef.current.lastTickTs = now;
        if (speedKmh >= 3) tripTrackRef.current.movingSec += dtSec;
        else tripTrackRef.current.stoppedSec += dtSec;
        const lastPt = tripTrackRef.current.points[tripTrackRef.current.points.length - 1];
        if (!lastPt || Math.abs(lastPt.lat - nav.gps.lat) > 0.00015 || Math.abs(lastPt.lon - nav.gps.lon) > 0.00015) {
          tripTrackRef.current.points.push({ lat: nav.gps.lat, lon: nav.gps.lon, ts: now, speedKmh });
        }
      }
    } else if (!isActiveNav && tripTrackRef.current) {
      const rec = tripTrackRef.current;
      tripTrackRef.current = null;
      if (rec.points.length >= 2) {
        const distKm = nav.route?.distanceKm ?? 0.5;
        appendTripRecord({
          id: `trip-${rec.startedAt}`,
          destName: rec.destName,
          startedAt: rec.startedAt,
          endedAt: Date.now(),
          distanceKm: distKm,
          movingSec: Math.round(rec.movingSec),
          stoppedSec: Math.round(rec.stoppedSec),
          points: rec.points,
        }).then(setTripHistory);
      }
    }
  }, [isActiveNav, nav.gps?.lat, nav.gps?.lon]);

  useEffect(() => {
    if (!tripShareToken || !nav.gps || !isActiveNav) return;
    const timer = setInterval(() => {
      if (nav.gps) {
        void updateTripShare({
          token: tripShareToken,
          lat: nav.gps.lat,
          lon: nav.gps.lon,
          etaSec: Math.round(nav.progress?.remainingDurationSec ?? nav.route?.durationSec ?? 0),
          remainingKm: Number(((nav.progress ? nav.progress.remainingDistanceMeters / 1000 : nav.route?.distanceKm) ?? 0).toFixed(2)),
        });
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [tripShareToken, isActiveNav, nav.gps, nav.progress, nav.route]);

  const vehicleDisplayCoord: [number, number] | null = useMemo(() => {
    if (!nav.gps) return null;
    if (isActiveNav && nav.progress?.snappedCoord && !nav.isSimulating) {
      return nav.progress.snappedCoord;
    }
    return [nav.gps.lon, nav.gps.lat];
  }, [nav.gps?.lat, nav.gps?.lon, isActiveNav, nav.isSimulating, nav.progress?.snappedCoord]);

  // 導航中下一個轉彎路口高亮座標（Priority 1.6：突出路線及下一個路口）
  const nextTurnCoord: [number, number] | null = useMemo(() => {
    if (!isActiveNav) return null;
    return nav.progress?.nextManeuver?.coordinate || nav.route?.maneuvers[1]?.coordinate || null;
  }, [isActiveNav, nav.progress?.nextManeuver?.coordinate, nav.route?.maneuvers]);

  // 自動載入目前地圖視野周邊的紅綠燈號誌位置（一般瀏覽/預覽時顯示周邊號誌，路線規劃與導航時突顯沿途紅綠燈）
  const signalQueryCenter = mapMovedCenter || nav.effectiveOrigin;
  useEffect(() => {
    if (!showTrafficSignals) return;
    let active = true;
    const timer = setTimeout(() => {
      fetchTrafficSignalsNear(signalQueryCenter, 850).then((sigs) => {
        if (active && sigs.length > 0) {
          setViewportSignals(sigs);
        }
      });
    }, 280);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [
    showTrafficSignals,
    Math.round(signalQueryCenter.lat * 200),
    Math.round(signalQueryCenter.lon * 200),
  ]);

  // 縮放達路口細節等級（zoom >= 16.0 或正式導航 3D 視角）時，依 0.003° 網格載入真實 OSM HD 道路面積與車道標線
  const hdGridLat = Math.round(signalQueryCenter.lat / 0.003) * 0.003;
  const hdGridLon = Math.round(signalQueryCenter.lon / 0.003) * 0.003;
  const hdDetailActive = zoomLevel >= 16.0 || uiState === 'navigation';
  useEffect(() => {
    if (!hdDetailActive) return;
    let active = true;
    const timer = setTimeout(() => {
      fetchHdRoadsNear({ lat: hdGridLat, lon: hdGridLon }).then((res) => {
        if (active && res) {
          setHdRoads(res);
        }
      });
    }, 220);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [hdDetailActive, hdGridLat, hdGridLon]);

  // P2 #10 & 現代化公車站牌圖層：依縮放層級與地標重要性（及大眾運輸模式）決定載入與顯示密度
  const isTransitFocus =
    nav.vehicleType === 'transit' ||
    Boolean(selectedTransitStop) ||
    (isSearchOpen && /公車|站牌|轉運/.test(searchQuery));
  const transitGridLat = Math.round(signalQueryCenter.lat / 0.005) * 0.005;
  const transitGridLon = Math.round(signalQueryCenter.lon / 0.005) * 0.005;
  const showInteractiveTransitStops =
    uiState !== 'navigation' && zoomLevel >= (isTransitFocus ? 13.8 : 14.6);
  useEffect(() => {
    if (!showInteractiveTransitStops) return;
    let active = true;
    const timer = setTimeout(() => {
      fetchTransitStopsNear(
        { lat: transitGridLat, lon: transitGridLon },
        isTransitFocus ? 900 : 650
      ).then((stops) => {
        if (active) setTransitStops(stops);
      });
    }, 320);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [showInteractiveTransitStops, transitGridLat, transitGridLon, isTransitFocus]);

  const sheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dy) > 10 && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.4,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 24) {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setSheetCollapsed(true);
          } else if (gesture.dy < -24) {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setSheetCollapsed(false);
          }
        },
      }),
    []
  );

  // Browse 地圖放大至社區層級 (>=15.2) 時自動載入周邊 YouBike 2.0 / 2.0E，並依縮放層級控制顯示密度與精簡/完整樣式
  const autoLoadYouBike = uiState === 'browse' && zoomLevel >= 15.2 && !categoryListOpen;
  useEffect(() => {
    if (!autoLoadYouBike) return;
    let active = true;
    const timer = setTimeout(() => {
      fetchYouBikeNear({ lat: transitGridLat, lon: transitGridLon }, 900).then((yb) => {
        if (active && yb.stations.length > 0) {
          setYouBikeStations(yb.stations);
          setYouBikeLiveAvailable(yb.liveAvailable);
          setYouBikeStatusMsg(yb.statusMessage || null);
        }
      });
    }, 450);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [autoLoadYouBike, transitGridLat, transitGridLon]);

  // Browse 模式下自動載入 GOBA 自建台灣 POI 地標（取代第三方底圖 POI，支援點擊查看詳情與導航）
  const autoLoadViewportPois =
    uiState === 'browse' && zoomLevel >= 13.8 && !categoryListOpen && !activePoiCat;
  const poiGridStep = zoomLevel >= 16.0 ? 0.008 : zoomLevel >= 15.0 ? 0.016 : 0.03;
  const poiGridLat = Math.round(signalQueryCenter.lat / poiGridStep) * poiGridStep;
  const poiGridLon = Math.round(signalQueryCenter.lon / poiGridStep) * poiGridStep;
  useEffect(() => {
    if (!autoLoadViewportPois) {
      if (uiState !== 'browse') setViewportPois([]);
      return;
    }
    let active = true;
    const timer = setTimeout(() => {
      fetchViewportPois({ lat: poiGridLat, lon: poiGridLon }, zoomLevel).then((pois) => {
        if (active) setViewportPois(pois);
      });
    }, 420);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [autoLoadViewportPois, poiGridLat, poiGridLon, zoomLevel, uiState]);

  const displayedYouBikeStations = useMemo(() => {
    if (uiState !== 'browse' || youBikeStations.length === 0) return [];
    if (activePoiCat === 'YouBike') return youBikeStations.slice(0, 22);
    if (zoomLevel < 15.2) return [];
    const minSpacingKm = zoomLevel < 16.0 ? 0.25 : 0.12;
    const maxCount = zoomLevel < 16.0 ? 6 : 10;
    const kept: YouBikeStation[] = [];
    for (const st of youBikeStations) {
      if (kept.length >= maxCount && selectedYouBike?.id !== st.id) continue;
      const tooClose = kept.some(
        (k) => k.id !== selectedYouBike?.id && haversineKm(k.lat, k.lon, st.lat, st.lon) < minSpacingKm
      );
      if (!tooClose || selectedYouBike?.id === st.id) kept.push(st);
    }
    return kept;
  }, [uiState, youBikeStations, activePoiCat, zoomLevel, selectedYouBike?.id]);

  const displayedTransitStops = useMemo(() => {
    if (!showInteractiveTransitStops || transitStops.length === 0) return [];
    const sorted = [...transitStops].sort((a, b) => {
      if (selectedTransitStop?.id === a.id) return -1;
      if (selectedTransitStop?.id === b.id) return 1;
      const routeDiff = (b.routes?.length || 0) - (a.routes?.length || 0);
      if (routeDiff !== 0) return routeDiff;
      return (a.distanceKm ?? 99) - (b.distanceKm ?? 99);
    });
    const minSpacingKm = isTransitFocus
      ? zoomLevel < 15.0
        ? 0.1
        : 0.03
      : zoomLevel < 15.8
      ? 0.18
      : 0.06;
    const maxCount = isTransitFocus ? 26 : zoomLevel < 15.8 ? 8 : 16;
    const kept: TransitBusStop[] = [];
    for (const stop of sorted) {
      if (kept.length >= maxCount) break;
      // 一般中距瀏覽時（<15.8）優先顯示具多條停靠路線的重要站點，避免孤立小站造成擁擠
      if (
        !isTransitFocus &&
        zoomLevel < 15.8 &&
        selectedTransitStop?.id !== stop.id &&
        (stop.routes?.length || 0) < 2 &&
        kept.length >= 4
      ) {
        continue;
      }
      const tooClose = kept.some(
        (k) =>
          k.id !== selectedTransitStop?.id &&
          haversineKm(k.lat, k.lon, stop.lat, stop.lon) < minSpacingKm
      );
      if (!tooClose) kept.push(stop);
    }
    return kept;
  }, [showInteractiveTransitStops, transitStops, isTransitFocus, zoomLevel, selectedTransitStop]);

  // 任務三：依畫面狀態與縮放等級進行紅綠燈視覺防碰撞聚類（絕不修改 nav.route.trafficSignals 導航核心資料！）
  const displayedTrafficSignals = useMemo(() => {
    if (!showTrafficSignals) return [];
    const routeSigs = nav.route?.trafficSignals || [];
    const nextSigId = nav.progress?.nextTrafficSignal?.id || null;
    const curShapeIdx = nav.progress?.nearestShapeIndex ?? 0;

    // 1. 正式導航中：僅顯示車頭前方即將經過且與路線相關的 4 個路口紅綠燈（優先聚焦下一個紅綠燈，不遮擋畫面）
    if (uiState === 'navigation') {
      return routeSigs
        .filter((rs) => typeof rs.shapeIndex !== 'number' || rs.shapeIndex > curShapeIdx)
        .slice(0, 4)
        .map((rs) => ({
          ...rs,
          isOnRoute: true,
          isPassed: false,
          isNextSignal: rs.id === nextSigId,
          isCompact: false,
        }));
    }

    // 2. 路線預覽中：使用小型紅綠燈標記 + 依縮放比例動態防碰撞過濾，絕不堆疊遮擋粉色路線與轉向節點
    if (uiState === 'route_preview') {
      const minSpacingKm =
        zoomLevel < 13.2
          ? 0.65
          : zoomLevel < 14.5
          ? 0.36
          : zoomLevel < 15.8
          ? 0.16
          : 0.055;
      const kept: Array<
        TrafficSignalNode & {
          isOnRoute: boolean;
          isPassed: boolean;
          isNextSignal: boolean;
          isCompact: boolean;
        }
      > = [];
      for (const rs of routeSigs) {
        const collides = kept.some(
          (k) => haversineKm(k.lat, k.lon, rs.lat, rs.lon) < minSpacingKm
        );
        if (!collides) {
          kept.push({
            ...rs,
            isOnRoute: true,
            isPassed: false,
            isNextSignal: false,
            isCompact: zoomLevel < 16.0,
          });
        }
      }
      return kept;
    }

    // 3. 一般瀏覽／地點詳情：縮放 >= 14.2 才顯示並套用防碰撞過濾
    if (zoomLevel < 14.2) return [];
    const browseMinSpacingKm = zoomLevel < 15.8 ? 0.12 : 0.045;
    const keptBrowse: Array<
      TrafficSignalNode & {
        isOnRoute: boolean;
        isPassed: boolean;
        isNextSignal: boolean;
        isCompact: boolean;
      }
    > = [];
    for (const vs of viewportSignals) {
      if (keptBrowse.length >= 28) break;
      const collides = keptBrowse.some(
        (k) => haversineKm(k.lat, k.lon, vs.lat, vs.lon) < browseMinSpacingKm
      );
      if (!collides) {
        keptBrowse.push({
          ...vs,
          isOnRoute: false,
          isPassed: false,
          isNextSignal: false,
          isCompact: zoomLevel < 15.8,
        });
      }
    }
    return keptBrowse;
  }, [
    showTrafficSignals,
    nav.route?.trafficSignals,
    nav.progress?.nextTrafficSignal?.id,
    nav.progress?.nearestShapeIndex,
    uiState,
    zoomLevel,
    viewportSignals,
  ]);

  // 3D 車輛座艙視角
  useEffect(() => {
    if (!isActiveNav || nav.followMode !== 'course' || !vehicleDisplayCoord || !nav.gps) return;
    const now = Date.now();
    if (now - lastCameraPushRef.current < 130) return;
    lastCameraPushRef.current = now;
    setIs3D(true);
    cameraRef.current?.easeTo({
      center: vehicleDisplayCoord,
      zoom: 17.8,
      pitch: 64,
      bearing: nav.gps.headingDeg && nav.gps.headingDeg >= 0 ? nav.gps.headingDeg : 0,
      padding: COCKPIT_CAMERA_PADDING,
      duration: 190,
      easing: 'linear',
    });
  }, [
    isActiveNav,
    nav.followMode,
    vehicleDisplayCoord?.[0],
    vehicleDisplayCoord?.[1],
    nav.gps?.headingDeg,
  ]);

  const handleOpenSearch = useCallback((slotToBind?: 'home' | 'work') => {
    setBindingAnchorSlot(slotToBind || null);
    setIsSearchOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 100);
  }, []);

  const handleCloseSearch = useCallback(() => {
    Keyboard.dismiss();
    setIsSearchOpen(false);
    setBindingAnchorSlot(null);
    setSearchResults([]);
  }, []);

  const handleQueryChange = useCallback(
    (text: string) => {
      setSearchQuery(text);
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      const trimmed = text.trim();
      if (trimmed.length < 2) {
        if (trimmed.length === 0) setSearchResults([]);
        return;
      }
      searchDebounceRef.current = setTimeout(async () => {
        setSearching(true);
        try {
          const res = await searchUnifiedPlaces(trimmed, {
            gpsCenter: nav.gps ? { lat: nav.gps.lat, lon: nav.gps.lon } : null,
            mapCenter: mapMovedCenter || nav.effectiveOrigin,
          });
          setSearchResults(res.places);
          if (res.searchBasis) setSearchBasis(res.searchBasis);
          setSearchLatencyMs(res.latencyMs);
        } catch {
          // ignore transient typing errors or aborted requests
        } finally {
          setSearching(false);
        }
      }, 280);
    },
    [nav.gps, nav.effectiveOrigin, mapMovedCenter]
  );

  const handleSearchSubmit = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    Keyboard.dismiss();
    setSearching(true);
    nav.setErrorMessage(null);
    try {
      const res = await searchUnifiedPlaces(q, {
        gpsCenter: nav.gps ? { lat: nav.gps.lat, lon: nav.gps.lon } : null,
        mapCenter: mapMovedCenter || nav.effectiveOrigin,
      });
      setSearchResults(res.places);
      if (res.searchBasis) setSearchBasis(res.searchBasis);
      setSearchLatencyMs(res.latencyMs);
      if (res.places.length === 0) {
        nav.setErrorMessage(`找不到「${q}」，請嘗試輸入完整路名、品牌或點此回報缺少地點`);
      }
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (err?.name !== 'AbortError' && !/abort|cancel/i.test(msg)) {
        nav.setErrorMessage(msg || '搜尋失敗，請稍後再試');
      }
    } finally {
      setSearching(false);
    }
  }, [searchQuery, nav.gps, nav.effectiveOrigin, nav.setErrorMessage, mapMovedCenter]);

  // 任務一（P0）：搜尋流程修正 — 搜尋地點 -> 顯示地點資訊 (PLACE_DETAILS) -> 點擊「路線規劃」才進入 ROUTE_PREVIEW！
  // 絕不因選取搜尋結果而自動呼叫路線引擎或直接跳進路線預覽。
  const handleSelectPlaceFromSearch = useCallback(
    async (place: SearchPlace) => {
      Keyboard.dismiss();
      nav.setErrorMessage(null);
      if (editingOriginMode) {
        setEditingOriginMode(false);
        setIsSearchOpen(false);
        setSearchResults([]);
        setSearchQuery('');
        await nav.setCustomOrigin(place);
        return;
      }

      if (addingWaypointMode) {
        setAddingWaypointMode(false);
        setIsSearchOpen(false);
        setSearchResults([]);
        setSearchQuery('');
        await nav.addWaypoint(place);
        return;
      }

      if (bindingAnchorSlot) {
        await nav.handleSetCommuteAnchor(bindingAnchorSlot, place);
        setBindingAnchorSlot(null);
        setIsSearchOpen(false);
        setSearchResults([]);
        setSearchQuery('');
        nav.setInspectedPlace(place);
        setSheetCollapsed(false);
        cameraRef.current?.easeTo({
          center: [place.lon, place.lat],
          zoom: 16.5,
          duration: 500,
        });
        return;
      }

      // 切換至 PLACE_DETAILS 狀態（清除可能殘留的舊路線，保留地點卡片與地圖標記）
      if (nav.route) {
        nav.clearRoute();
      }
      setIsSearchOpen(false);
      setSearchResults([]);
      setNearbyPins([]);
      setActivePoiCat(null);
      setOverlappingCandidates([]);
      setSearchQuery(place.name);
      setShowManeuvers(false);
      setSheetCollapsed(false);
      nav.setFollowMode('free');

      const withDist: SearchPlace = {
        ...place,
        distanceKm:
          typeof place.distanceKm === 'number'
            ? place.distanceKm
            : haversineKm(
                nav.effectiveOrigin.lat,
                nav.effectiveOrigin.lon,
                place.lat,
                place.lon
              ),
      };
      nav.setInspectedPlace(withDist);
      cameraRef.current?.easeTo({
        center: [place.lon, place.lat],
        zoom: 16.5,
        pitch: 0,
        duration: 500,
      });

      // 背景同步最新核實地點詳情（確保名稱、地址、座標與資料庫一致），不觸發路線規劃
      if (place.placeId && !place.placeId.startsWith('pin-')) {
        const verified = await fetchPlaceDetailById(place.placeId, nav.effectiveOrigin);
        if (verified) {
          nav.setInspectedPlace(verified);
        }
      }
    },
    [
      bindingAnchorSlot,
      editingOriginMode,
      addingWaypointMode,
      nav.setErrorMessage,
      nav.setCustomOrigin,
      nav.addWaypoint,
      nav.handleSetCommuteAnchor,
      nav.setInspectedPlace,
      nav.route,
      nav.clearRoute,
      nav.effectiveOrigin,
    ]
  );

  // Browse 狀態下點擊地圖或 POI：先展開「地點詳細資訊卡」，並自動清除過期搜尋錯誤訊息
  const handleInspectPlaceOnMap = useCallback(
    (place: SearchPlace) => {
      Keyboard.dismiss();
      nav.setErrorMessage(null);
      const withDist: SearchPlace = {
        ...place,
        distanceKm:
          typeof place.distanceKm === 'number'
            ? place.distanceKm
            : haversineKm(
                nav.effectiveOrigin.lat,
                nav.effectiveOrigin.lon,
                place.lat,
                place.lon
              ),
      };
      nav.setInspectedPlace(withDist);
      setSheetCollapsed(false);
      nav.setFollowMode('free');
      cameraRef.current?.easeTo({
        center: [place.lon, place.lat],
        zoom: Math.max(zoomLevel, 16.0),
        duration: 420,
      });
    },
    [nav.effectiveOrigin, nav.setInspectedPlace, zoomLevel]
  );

  // Section 四：地標 Marker 點擊專用處理器
  // 1. 立即記錄 lastMarkerTapTsRef 阻擋底層 <Map onPress> 事件冒泡覆蓋選取結果
  // 2. 若 35m 內有多個重疊地標，提供候選清單供使用者確認
  // 3. 若有穩定 placeId，同步向後端確認最新核實資料，確保卡片與座標完全一致
  const handleMarkerSelectPlace = useCallback(
    async (pin: SearchPlace) => {
      lastMarkerTapTsRef.current = Date.now();
      const overlapping = nearbyPins.filter(
        (other) => haversineKm(pin.lat, pin.lon, other.lat, other.lon) <= 0.035
      );
      if (overlapping.length > 1) {
        setOverlappingCandidates(overlapping);
      } else {
        setOverlappingCandidates([]);
      }
      handleInspectPlaceOnMap(pin);
      if (pin.placeId && !pin.placeId.startsWith('pin-')) {
        const verified = await fetchPlaceDetailById(pin.placeId, nav.effectiveOrigin);
        if (verified) {
          nav.setInspectedPlace(verified);
        }
      }
    },
    [nearbyPins, handleInspectPlaceOnMap, nav.effectiveOrigin]
  );

  // 點擊或長按地圖任意處：反查台灣真實地址並顯示地點詳細資訊卡（絕不覆蓋剛點擊的 Marker！）
  const handleMapTapInspect = useCallback(
    async (event: any) => {
      if (uiState !== 'browse' || showSettingsPanel) return;
      // 阻擋 iOS MapLibre 點擊 Marker 後同步冒泡觸發的 Map onPress（修復點擊 7-11 卻跳出底層社區大樓的問題）
      if (Date.now() - lastMarkerTapTsRef.current < 480) return;
      const lngLat = event?.nativeEvent?.lngLat;
      if (!Array.isArray(lngLat) || lngLat.length < 2) return;
      Keyboard.dismiss();
      const [lon, lat] = lngLat;

      // 若點擊位置正好落在已顯示的 POI Marker 22m 內，優先選取可見 POI 而非底圖反查
      const hitPins = nearbyPins.filter((p) => haversineKm(lat, lon, p.lat, p.lon) <= 0.022);
      if (hitPins.length > 0) {
        await handleMarkerSelectPlace(hitPins[0]);
        return;
      }

      setOverlappingCandidates([]);
      const tapTs = Date.now();
      const resolved = await reverseGeocodeLocation(lat, lon);
      // 反查期間若使用者點擊了 Marker，放棄此次過期反查結果
      if (lastMarkerTapTsRef.current >= tapTs) return;
      const droppedPlace: SearchPlace = {
        id: `pin-${lat.toFixed(5)}-${lon.toFixed(5)}`,
        name: resolved.name,
        address: resolved.address,
        lat,
        lon,
        category: '地圖選點',
        distanceKm: haversineKm(nav.effectiveOrigin.lat, nav.effectiveOrigin.lon, lat, lon),
      };
      handleInspectPlaceOnMap(droppedPlace);
    },
    [
      uiState,
      showSettingsPanel,
      nearbyPins,
      nav.effectiveOrigin,
      handleMarkerSelectPlace,
      handleInspectPlaceOnMap,
    ]
  );

  // P0：快捷分類搜尋嚴格套用 categoryId，切換分類前立即清除舊標記與地點卡片，並以序號防護避免過期回應覆蓋！
  const handleQuickPoiCategory = useCallback(
    async (catLabel: string, query: string, categoryId?: string, centerOverride?: Coordinate) => {
      const reqSeq = ++categoryReqSeqRef.current;

      if (!centerOverride && activePoiCat === catLabel) {
        setActivePoiCat(null);
        setNearbyPins([]);
        setYouBikeStations([]);
        setCategoryListOpen(false);
        setSelectedYouBike(null);
        setSelectedTransitStop(null);
        setOverlappingCandidates([]);
        nav.setInspectedPlace(null);
        setShowSearchAreaBtn(false);
        return;
      }

      // 切換分類瞬間立刻清除上一分類的標記與地點卡片，避免舊資料殘留畫面
      setActivePoiCat(catLabel);
      setNearbyPins([]);
      setSelectedYouBike(null);
      setSelectedTransitStop(null);
      setOverlappingCandidates([]);
      nav.setInspectedPlace(null);
      setCategoryFilterOpenNow(false);
      setCategoryBrandFilter('全部');
      setCategorySortBy('distance');
      setShowSearchAreaBtn(false);
      setSearching(true);
      nav.setErrorMessage(null);

      const resolvedCatId =
        categoryId ||
        QUICK_POI_CATEGORIES.find((c) => c.label === catLabel)?.categoryId;
      const searchCenter = centerOverride || mapMovedCenter || nav.effectiveOrigin;

      // P2 #11：YouBike 即時站點專屬分類查詢（使用官方即時資料，絕不使用假數字）
      if (resolvedCatId === 'youbike') {
        try {
          const yb = await fetchYouBikeNear(searchCenter, 1600);
          if (reqSeq !== categoryReqSeqRef.current) return;
          setYouBikeStations(yb.stations);
          setYouBikeLiveAvailable(yb.liveAvailable);
          setYouBikeStatusMsg(yb.statusMessage || null);
          setCategoryListOpen(true);
          setSheetCollapsed(false);
          if (!yb.liveAvailable) {
            nav.setErrorMessage(yb.statusMessage || '即時資訊暫時無法取得');
          } else if (yb.stations.length === 0) {
            nav.setErrorMessage('此區域附近暫無 YouBike 站點');
          } else {
            cameraRef.current?.easeTo({
              center: [searchCenter.lon, searchCenter.lat],
              zoom: 14.5,
              duration: 450,
            });
          }
        } finally {
          if (reqSeq === categoryReqSeqRef.current) setSearching(false);
        }
        return;
      }

      setYouBikeStations([]);
      try {
        const res = await searchUnifiedPlaces(query, {
          gpsCenter: searchCenter,
          mapCenter: searchCenter,
          category: resolvedCatId,
          sortBy: 'distance',
        });
        if (reqSeq !== categoryReqSeqRef.current) return;

        // 雙重保證：前端亦嚴格過濾，確保「加油站」絕不出現任何餐廳／超商或其他無關類別
        const strictFiltered = resolvedCatId
          ? res.places.filter((p) => p.category === resolvedCatId)
          : res.places;

        setNearbyPins(strictFiltered);
        if (res.searchBasis) setSearchBasis(res.searchBasis);
        setSearchLatencyMs(res.latencyMs);
        if (strictFiltered.length > 0) {
          // P1 #1：絕不自動選取第一個地點！改為展開底部可滑動搜尋結果清單，同時在地圖上顯示所有符合條件的站點
          setCategoryListOpen(true);
          setSheetCollapsed(false);
          cameraRef.current?.easeTo({
            center: [searchCenter.lon, searchCenter.lat],
            zoom: 14.2,
            duration: 450,
          });
        } else {
          setCategoryListOpen(false);
          nav.setErrorMessage(`此區域附近暫無「${catLabel}」搜尋結果`);
        }
      } catch (err: any) {
        if (reqSeq !== categoryReqSeqRef.current) return;
        const msg = String(err?.message || '');
        if (err?.name !== 'AbortError' && !/abort|cancel/i.test(msg)) {
          nav.setErrorMessage(msg || '附近景點搜尋失敗');
        }
      } finally {
        if (reqSeq === categoryReqSeqRef.current) {
          setSearching(false);
        }
      }
    },
    [
      activePoiCat,
      nav.setInspectedPlace,
      nav.setErrorMessage,
      nav.effectiveOrigin,
      mapMovedCenter,
      handleInspectPlaceOnMap,
    ]
  );

  // 地圖移動後點擊「搜尋這個區域」
  const handleSearchThisArea = useCallback(async () => {
    const center = mapMovedCenter || nav.effectiveOrigin;
    setShowSearchAreaBtn(false);
    const activeCatObj = QUICK_POI_CATEGORIES.find((c) => c.label === activePoiCat);
    const q = activeCatObj ? activeCatObj.query : searchQuery.trim() || '加油站';
    await handleQuickPoiCategory(
      activeCatObj?.label || q,
      q,
      activeCatObj?.categoryId,
      center
    );
  }, [mapMovedCenter, nav.effectiveOrigin, activePoiCat, searchQuery, handleQuickPoiCategory]);

  // P1：依縮放等級自動合併密集分類標記，避免同時渲染過多標記拖慢滑動幀率
  const displayedNearbyPins = useMemo(() => {
    if (nearbyPins.length === 0) return [];
    const minSpacingKm =
      zoomLevel < 12.5 ? 0.65 : zoomLevel < 14.0 ? 0.25 : zoomLevel < 15.5 ? 0.08 : 0.0;
    if (minSpacingKm <= 0) return nearbyPins.slice(0, 24);
    const kept: SearchPlace[] = [];
    for (const pin of nearbyPins) {
      if (kept.length >= 18) break;
      const collides = kept.some((k) => haversineKm(k.lat, k.lon, pin.lat, pin.lon) < minSpacingKm);
      if (!collides) kept.push(pin);
    }
    return kept;
  }, [nearbyPins, zoomLevel]);

  // Section 六：每次開啟新增／修改地點表單皆完全重置獨立狀態，絕不繼承上一筆商家或目前 GPS 座標！
  const handleOpenFeedbackModal = useCallback((place?: SearchPlace | null) => {
    const isAddMissing = place === null;
    const target = isAddMissing ? null : place || null;
    setFeedbackTargetPlace(target);
    setFeedbackName(target?.name || '');
    setFeedbackAddress(target?.address || '');
    setFeedbackPhone(target?.phone || '');
    setFeedbackHours(target?.openingHours || '');
    setFeedbackNote('');
    setFeedbackIssueType(target ? 'relocated' : 'missing_place');
    setFeedbackLat(target ? target.lat : null);
    setFeedbackLon(target ? target.lon : null);
    setFeedbackGeoCandidates([]);
    setFeedbackManualPin(false);
    setFeedbackGeocoding(false);
    setFeedbackModalVisible(true);
  }, []);

  const handleGeocodeFeedbackAddress = useCallback(async (addrInput?: string) => {
    const addr = (addrInput ?? feedbackAddress).trim();
    if (addr.length < 4) {
      Alert.alert('請輸入完整地址', '請先輸入包含縣市與路名的台灣完整地址再解析位置。');
      return null;
    }
    setFeedbackGeocoding(true);
    try {
      const cands = await geocodeTaiwanAddress(addr);
      setFeedbackGeoCandidates(cands);
      if (cands.length > 0) {
        setFeedbackLat(cands[0].lat);
        setFeedbackLon(cands[0].lon);
        setFeedbackManualPin(false);
        return cands[0];
      } else {
        setFeedbackLat(null);
        setFeedbackLon(null);
        Alert.alert(
          '門牌無法自動解析',
          '找不到此門牌座標，請確認地址是否正確，或直接點擊下方預覽地圖手動標記正確位置。'
        );
        return null;
      }
    } finally {
      setFeedbackGeocoding(false);
    }
  }, [feedbackAddress]);

  const handleSubmitFeedback = useCallback(async () => {
    const trimmedName = feedbackName.trim();
    const trimmedAddr = feedbackAddress.trim();
    if (!trimmedName) {
      Alert.alert('請填寫名稱', '請輸入正確的商家或地點名稱。');
      return;
    }

    setFeedbackSubmitting(true);
    try {
      let finalLat = feedbackLat;
      let finalLon = feedbackLon;

      // 若是新增地點、搬遷或地址錯誤，且尚未手動在地圖確認標記，送出前一律先以填寫的地址進行地理編碼驗證
      const needsAddrGeocode =
        feedbackIssueType === 'missing_place' ||
        feedbackIssueType === 'relocated' ||
        feedbackIssueType === 'address_wrong';

      if (needsAddrGeocode && !feedbackManualPin && trimmedAddr.length >= 4) {
        const cands = await geocodeTaiwanAddress(trimmedAddr);
        if (cands.length > 0) {
          finalLat = cands[0].lat;
          finalLon = cands[0].lon;
          setFeedbackLat(finalLat);
          setFeedbackLon(finalLon);
        } else if (feedbackIssueType === 'missing_place') {
          Alert.alert(
            '尚未確認座標',
            '系統無法自動解析您輸入的地址，為避免座標錯誤（絕不使用預設或目前位置代替），請點選下方地圖預覽手動標記正確位置後再送出。'
          );
          return;
        }
      }

      if (
        feedbackIssueType === 'missing_place' &&
        (finalLat === null || finalLon === null)
      ) {
        Alert.alert(
          '請先確認地點位置',
          '請點擊「解析門牌定位」或在預覽地圖上點擊正確位置後再送出。'
        );
        return;
      }

      const res = await submitPlaceErrorFeedback({
        placeId: feedbackTargetPlace?.placeId || feedbackTargetPlace?.id || undefined,
        issueType: feedbackIssueType,
        proposedChanges: {
          name: trimmedName,
          address: trimmedAddr || undefined,
          phone: feedbackPhone.trim() || undefined,
          opening_hours: feedbackHours.trim() || undefined,
          lat: finalLat ?? undefined,
          lon: finalLon ?? undefined,
          manual_pin_confirmed: feedbackManualPin,
          note: feedbackNote.trim() || undefined,
        },
        originalSnapshot: feedbackTargetPlace || null,
      });

      setFeedbackModalVisible(false);
      // 送出後立即徹底清空表單，防止跨地點殘留
      setFeedbackTargetPlace(null);
      setFeedbackLat(null);
      setFeedbackLon(null);
      setFeedbackGeoCandidates([]);
      setFeedbackManualPin(false);

      const warnSuffix = res.coordinate_warning ? `\n\n⚠️ ${res.coordinate_warning}` : '';
      Alert.alert(
        '已送出地點修正回報',
        `${res.message}\n（回報單號 #${res.feedback_id}）${warnSuffix}`
      );
    } catch (err: any) {
      Alert.alert('回報失敗', err?.message || '請稍後再試');
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [
    feedbackTargetPlace,
    feedbackIssueType,
    feedbackName,
    feedbackAddress,
    feedbackPhone,
    feedbackHours,
    feedbackNote,
    feedbackLat,
    feedbackLon,
    feedbackManualPin,
  ]);

  const handleSharePlace = useCallback(async (place: SearchPlace) => {
    try {
      await Share.share({
        title: place.name,
        message: `${place.name}\n地址：${place.address}${
          place.phone ? `\n電話：${place.phone}` : ''
        }\n座標：${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`,
      });
    } catch {
      // ignore
    }
  }, []);

  const handleStartNavigationPress = useCallback(() => {
    // P1 #8：起點不在使用者目前位置時，開始導航前必須確認實際 GPS 位置與起點是否一致
    if (nav.isCustomOrigin && nav.customOrigin) {
      const distKm = haversineKm(
        nav.effectiveOrigin.lat,
        nav.effectiveOrigin.lon,
        nav.customOrigin.lat,
        nav.customOrigin.lon
      );
      if (distKm > 0.15) {
        Alert.alert(
          '目前為自訂起點路線預覽',
          `您設定的起點「${nav.customOrigin.name}」距離目前 GPS 位置約 ${distKm.toFixed(1)} 公里。\n\n要改從目前 GPS 位置重新規劃並開始即時導航，還是從自訂起點進行模擬預覽？`,
          [
            { text: '留在路線預覽', style: 'cancel' },
            {
              text: '改從目前位置導航',
              onPress: async () => {
                await nav.setCustomOrigin(null);
                setSheetCollapsed(false);
                nav.startNavigation();
              },
            },
            {
              text: '模擬預覽此路線',
              onPress: () => {
                setSheetCollapsed(false);
                nav.startSimulatedNavigation();
              },
            },
          ]
        );
        return;
      }
    }

    if (!activeProfile.isProductionVerified) {
      Alert.alert(
        `${activeProfile.label}模式（路網驗證中）`,
        `${activeProfile.verificationNote}\n\n本模式尚未完成全台禁行機車與快速道路匝道驗證，僅供參考測試，行駛時務必以現場交通標誌為準。`,
        [
          { text: '改用汽車模式', onPress: () => nav.setVehicleType('car') },
          {
            text: '僅供測試繼續',
            style: 'destructive',
            onPress: () => {
              setSheetCollapsed(false);
              nav.startNavigation();
            },
          },
        ]
      );
      return;
    }
    setSheetCollapsed(false);
    nav.startNavigation();
  }, [
    activeProfile,
    nav.isCustomOrigin,
    nav.customOrigin,
    nav.effectiveOrigin,
    nav.setCustomOrigin,
    nav.setVehicleType,
    nav.startNavigation,
    nav.startSimulatedNavigation,
  ]);

  const handleOverviewRoute = useCallback(() => {
    if (!nav.route) return;
    const [west, south, east, north] = nav.route.bbox;
    nav.setFollowMode('free');
    setIs3D(false);
    cameraRef.current?.fitBounds([west, south, east, north], {
      padding: { top: 185, right: 50, bottom: 260, left: 50 },
      pitch: 0,
      bearing: 0,
      duration: 600,
    });
  }, [nav.route, nav.setFollowMode]);

  const handleRecenterCockpit = useCallback(() => {
    nav.setFollowMode('course');
    setIs3D(true);
    if (vehicleDisplayCoord && nav.gps) {
      cameraRef.current?.easeTo({
        center: vehicleDisplayCoord,
        zoom: 17.8,
        pitch: 64,
        bearing: nav.gps.headingDeg && nav.gps.headingDeg >= 0 ? nav.gps.headingDeg : 0,
        padding: COCKPIT_CAMERA_PADDING,
        duration: 400,
      });
    }
  }, [nav.setFollowMode, nav.gps, vehicleDisplayCoord]);

  const handleCycleFollowMode = useCallback(() => {
    const order: Array<'follow' | 'heading' | 'course'> = ['follow', 'heading', 'course'];
    const idx = order.indexOf(nav.followMode as any);
    const next = order[(idx + 1) % order.length];
    nav.setFollowMode(next);
    if (nav.gps) {
      cameraRef.current?.easeTo({
        center: [nav.gps.lon, nav.gps.lat],
        zoom: Math.max(zoomLevel, 16),
        pitch: next === 'course' ? 60 : is3D ? 48 : 0,
        duration: 450,
      });
    }
  }, [nav.followMode, nav.setFollowMode, nav.gps, zoomLevel, is3D]);

  const handleToggleAvoidOption = useCallback(
    async (kind: 'tolls' | 'highways') => {
      const nextTolls = kind === 'tolls' ? !nav.avoidTolls : nav.avoidTolls;
      const nextHighways = kind === 'highways' ? !nav.avoidHighways : nav.avoidHighways;
      nav.setAvoidTolls(nextTolls);
      nav.setAvoidHighways(nextHighways);
      if (nav.destination) {
        await nav.calculateRoute(nav.destination, {
          avoidTolls: nextTolls,
          avoidHighways: nextHighways,
        });
      }
    },
    [
      nav.avoidTolls,
      nav.avoidHighways,
      nav.setAvoidTolls,
      nav.setAvoidHighways,
      nav.destination,
      nav.calculateRoute,
    ]
  );

  const followIconName =
    nav.followMode === 'course'
      ? 'navigate'
      : nav.followMode === 'heading'
      ? 'compass'
      : nav.followMode === 'follow'
      ? 'locate'
      : 'locate-outline';

  const remainingDistKm = nav.progress
    ? nav.progress.remainingDistanceMeters / 1000
    : nav.route?.distanceKm ?? 0;
  const remainingSec = nav.progress
    ? nav.progress.remainingDurationSec
    : nav.route?.durationSec ?? 0;

  return (
    <View style={[styles.root, isNight && { backgroundColor: '#0F172A' }]}>
      {/* ==================== MapLibre 台灣繁體中文向量底圖 ==================== */}
      <Map
        ref={mapRef}
        style={styles.map}
        mapStyle={effectiveStyleUrl}
        touchRotate
        touchPitch
        touchZoom
        dragPan
        compass
        compassPosition={{ top: uiState === 'navigation' ? 195 : 140, left: 16 }}
        attributionPosition={{ bottom: 6, left: 10 }}
        onPress={handleMapTapInspect}
        onLongPress={handleMapTapInspect}
        onDidFinishLoadingMap={() => {
          if (mapFirstLoadMs === null) {
            setMapFirstLoadMs(Date.now() - mapMountTsRef.current);
          }
        }}
        onDidFailLoadingMap={() => {
          recordNavDiagnostic('map_style_fallback', 'STYLE_LOAD_FAIL');
          if (!useFallbackStyle) setUseFallbackStyle(true);
        }}
        onRegionDidChange={(e) => {
          if (typeof e?.nativeEvent?.zoom === 'number') {
            // 量化至 0.5 級距更新，避免雙指縮放過程中頻繁觸發整個 React 畫面重繪
            const quantizedZoom = Math.round(e.nativeEvent.zoom * 2) / 2;
            setZoomLevel((prev) => (prev === quantizedZoom ? prev : quantizedZoom));
          }
          if (e?.nativeEvent?.userInteraction) {
            // 防止程式自動更新 3D 座艙鏡頭時誤判為手勢拖曳而跳出車頭視角
            const isProgrammaticCockpitPush =
              uiState === 'navigation' && Date.now() - lastCameraPushRef.current < 340;
            if (!isProgrammaticCockpitPush && nav.followMode !== 'free') {
              nav.setFollowMode('free');
            }
            const center = e?.nativeEvent?.center;
            if (Array.isArray(center) && center.length >= 2) {
              const moved: Coordinate = { lat: Number(center[1]), lon: Number(center[0]) };
              setMapMovedCenter((prev) => {
                if (prev && haversineKm(prev.lat, prev.lon, moved.lat, moved.lon) < 0.12) {
                  return prev;
                }
                return moved;
              });
              if (
                uiState === 'browse' &&
                (activePoiCat || nearbyPins.length > 0) &&
                haversineKm(
                  nav.effectiveOrigin.lat,
                  nav.effectiveOrigin.lon,
                  moved.lat,
                  moved.lon
                ) > 0.5
              ) {
                setShowSearchAreaBtn(true);
              }
            }
          }
        }}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: [nav.effectiveOrigin.lon, nav.effectiveOrigin.lat],
            zoom: 14.5,
            pitch: 0,
            bearing: 0,
          }}
          trackUserLocation={mapLibreTrackMode}
          onTrackUserLocationChange={(e) => {
            if (!e?.nativeEvent?.trackUserLocation && nav.followMode !== 'free') {
              nav.setFollowMode('free');
            }
          }}
        />

        {nav.gpsPermission === 'granted' && uiState !== 'navigation' && (
          <UserLocation animated accuracy heading />
        )}

        {/* ==================== 高精度道路面積、3D 高架橋、分隔島與車道標線（React.memo 隔離重繪） ==================== */}
        <HdRoadLayers
          hdDetailActive={hdDetailActive}
          hdRoads={hdRoads}
          isNight={isNight}
          liveTrafficGeoJSON={liveTrafficGeoJSON}
        />

        {/* 已行駛路線（灰化） */}
        {passedGeoJSON && (
          <GeoJSONSource id="goba-route-passed-source" data={passedGeoJSON}>
            <Layer
              id="goba-route-passed-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': '#94A3B8',
                'line-width': 7,
                'line-opacity': 0.68,
              }}
            />
          </GeoJSONSource>
        )}

        {/* 備選路線預覽線（僅在路線預覽階段顯示未選中的替代路徑） */}
        {uiState === 'route_preview' &&
          (nav.primaryRoute?.alternatives || []).map((alt, idx) => {
            const altIdx = idx + 1;
            if (nav.selectedAltIndex === altIdx || alt.coordinates.length < 2) return null;
            return (
              <GeoJSONSource
                key={`alt-route-${altIdx}`}
                id={`goba-alt-route-source-${altIdx}`}
                data={{
                  type: 'FeatureCollection',
                  features: [
                    {
                      type: 'Feature',
                      properties: {},
                      geometry: { type: 'LineString', coordinates: alt.coordinates },
                    },
                  ],
                }}
              >
                <Layer
                  id={`goba-alt-route-line-${altIdx}`}
                  type="line"
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                  paint={{
                    'line-color': isNight ? '#64748B' : '#94A3B8',
                    'line-width': 6,
                    'line-opacity': 0.55,
                  }}
                />
              </GeoJSONSource>
            );
          })}

        {/* 前方剩餘路線（一般/夜間地圖使用高對比綠色，GOBA 粉主題使用品牌粉紅色） */}
        {remainingGeoJSON && (
          <GeoJSONSource id="goba-route-source" data={remainingGeoJSON}>
            <Layer
              id="goba-route-casing"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': isPinkTheme ? '#9D174D' : '#14532D',
                'line-width': uiState === 'navigation' ? 14 : 11,
                'line-opacity': 0.92,
              }}
            />
            <Layer
              id="goba-route-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': isPinkTheme ? '#EC4899' : '#16A34A',
                'line-width': uiState === 'navigation' ? 9 : 6.5,
                'line-opacity': 1,
              }}
            />
          </GeoJSONSource>
        )}

        {/* 車隊隊友即時位置標記（僅顯示已開啟位置共享的成員） */}
        {(fleetState.fleet?.members || [])
          .filter(
            (m) =>
              m.member_id !== fleetState.memberId &&
              m.share_location &&
              m.lat !== null &&
              m.lon !== null
          )
          .map((m) => (
            <Marker
              key={`fleet-member-${m.member_id}`}
              id={`fleet-member-${m.member_id}`}
              lngLat={[m.lon!, m.lat!]}
              anchor="bottom"
            >
              <View style={{ alignItems: 'center' }}>
                <View
                  style={{
                    backgroundColor: m.is_lagging ? '#DC2626' : m.is_leader ? '#EC4899' : '#0EA5E9',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: '#FFFFFF',
                    shadowColor: '#000',
                    shadowOpacity: 0.3,
                    shadowRadius: 4,
                  }}
                >
                  <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '800' }}>
                    {m.nickname} · {m.speed_kmh ?? 0}km/h
                  </Text>
                </View>
              </View>
            </Marker>
          ))}

        {/* 停車位置標記（第 34 項） */}
        {savedParking && (
          <Marker id="goba-saved-parking" lngLat={[savedParking.lon, savedParking.lat]} anchor="bottom">
            <View style={{ backgroundColor: '#2563EB', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 10, borderWidth: 2, borderColor: '#FFF' }}>
              <Text style={{ color: '#FFF', fontSize: 11, fontWeight: '900' }}>P 愛車</Text>
            </View>
          </Marker>
        )}

        {/* 全台警政署測速照相／區間測速／科技執法點位（精簡速限圓牌樣式） */}
        {shendunEnabled &&
          zoomLevel >= 13 &&
          speedCameras.slice(0, 40).map((cam) => (
            <Marker key={cam.id} id={cam.id} lngLat={[cam.lon, cam.lat]} anchor="center">
              <View
                style={{
                  backgroundColor: '#FFFFFF',
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  borderWidth: 2.5,
                  borderColor: cam.camera_type === 'tech_enforcement' ? '#7C3AED' : '#DC2626',
                  alignItems: 'center',
                  justifyContent: 'center',
                  shadowColor: '#000',
                  shadowOpacity: 0.2,
                  shadowRadius: 2.5,
                }}
              >
                {typeof cam.speed_limit_kmh === 'number' && cam.speed_limit_kmh > 0 ? (
                  <Text style={{ fontSize: 9.5, fontWeight: '900', color: '#0F172A' }}>
                    {cam.speed_limit_kmh}
                  </Text>
                ) : (
                  <Ionicons name="camera" size={11} color="#DC2626" />
                )}
              </View>
            </Marker>
          ))}

        {/* 社群交通回報點位（第 16 項，點擊確認存在） */}
        {communityReports.slice(0, 30).map((rep) => (
          <Marker key={`rep-${rep.id}`} id={`rep-${rep.id}`} lngLat={[rep.lon, rep.lat]} anchor="bottom">
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  `社群回報：${rep.road_name}`,
                  `${rep.category}（${rep.age_min} 分鐘前 · ${rep.upvotes} 人確認）`,
                  [
                    { text: '已排除', onPress: () => voteCommunityReport(rep.id, 'dismiss') },
                    { text: '仍在現場 (+1)', onPress: () => voteCommunityReport(rep.id, 'confirm') },
                  ]
                );
              }}
              style={{ backgroundColor: '#F59E0B', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 10, borderWidth: 1.5, borderColor: '#FFF' }}
            >
              <Text style={{ color: '#FFF', fontSize: 10, fontWeight: '900' }}>! {rep.category === 'police' ? '臨檢' : rep.category === 'accident' ? '事故' : rep.category === 'speed_camera' ? '測速' : '路況'}</Text>
            </TouchableOpacity>
          </Marker>
        ))}

        {/* 紅綠燈號誌路口標記（路線預覽自動切換小型防碰撞標記不遮擋路線，導航中僅顯示前方相關號誌並高亮下一個） */}
        {displayedTrafficSignals.map((sig) => (
          <Marker
            key={sig.id}
            id={`traffic-signal-${sig.id}`}
            lngLat={[sig.lon, sig.lat]}
            anchor="center"
          >
            <View
              style={[
                sig.isCompact ? styles.trafficSignalHousingCompact : styles.trafficSignalHousing,
                sig.isOnRoute && !sig.isCompact && styles.trafficSignalHousingOnRoute,
                sig.isNextSignal && styles.trafficSignalHousingNext,
                sig.isPassed && { opacity: 0.42 },
              ]}
            >
              <View
                style={[
                  sig.isCompact ? styles.trafficSignalDotCompact : styles.trafficSignalDot,
                  { backgroundColor: '#EF4444' },
                ]}
              />
              <View
                style={[
                  sig.isCompact ? styles.trafficSignalDotCompact : styles.trafficSignalDot,
                  { backgroundColor: '#F59E0B' },
                ]}
              />
              <View
                style={[
                  sig.isCompact ? styles.trafficSignalDotCompact : styles.trafficSignalDot,
                  { backgroundColor: '#10B981' },
                ]}
              />
            </View>
          </Marker>
        ))}

        {/* GOBA 公車站牌（高德風格迷你綠牌站牌，捷運/鐵路為簡潔圓標） */}
        {displayedTransitStops.map((stop) => {
          const isSel = selectedTransitStop?.id === stop.id;
          const isRailOrMrt = stop.stopType === 'mrt' || stop.stopType === 'rail';
          const showLabel = isSel || isTransitFocus || (isRailOrMrt && zoomLevel >= 15.2);
          return (
            <Marker
              key={stop.id}
              id={`transit-stop-${stop.id}`}
              lngLat={[stop.lon, stop.lat]}
              anchor="bottom"
              onPress={() => {
                lastMarkerTapTsRef.current = Date.now();
                setSelectedTransitStop(stop);
                setSelectedYouBike(null);
                setCategoryListOpen(false);
                nav.setInspectedPlace(null);
                setSheetCollapsed(false);
                cameraRef.current?.easeTo({
                  center: [stop.lon, stop.lat],
                  zoom: Math.max(zoomLevel, 16.5),
                  duration: 380,
                });
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                {isRailOrMrt ? (
                  <View
                    style={{
                      width: isSel ? 22 : 18,
                      height: isSel ? 22 : 18,
                      borderRadius: isSel ? 11 : 9,
                      backgroundColor: isSel
                        ? '#DB2777'
                        : stop.stopType === 'mrt'
                        ? '#7C3AED'
                        : '#1E293B',
                      borderWidth: 1.2,
                      borderColor: '#FFFFFF',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: '#000',
                      shadowOpacity: 0.2,
                      shadowRadius: 3,
                      elevation: 3,
                    }}
                  >
                    <Ionicons name="train" size={isSel ? 11 : 9} color="#FFFFFF" />
                  </View>
                ) : (
                  /* 高德風格迷你公車站牌圖示 */
                  <View style={{ alignItems: 'center' }}>
                    <View
                      style={{
                        width: isSel ? 22 : 18,
                        height: isSel ? 15 : 12,
                        borderRadius: 3,
                        backgroundColor: isSel ? '#059669' : '#10B981',
                        borderWidth: 1.2,
                        borderColor: '#FFFFFF',
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: '#000',
                        shadowOpacity: 0.22,
                        shadowRadius: 2.5,
                        elevation: 3,
                      }}
                    >
                      <View
                        style={{
                          width: isSel ? 14 : 11,
                          height: isSel ? 8 : 6,
                          borderRadius: 1.5,
                          backgroundColor: '#FFFFFF',
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 1.5,
                          gap: 1.5,
                        }}
                      >
                        <View
                          style={{
                            width: isSel ? 4.5 : 3.5,
                            height: isSel ? 4.5 : 3.5,
                            borderRadius: 1,
                            backgroundColor: '#EF4444',
                          }}
                        />
                        <View
                          style={{
                            flex: 1,
                            height: 2,
                            borderRadius: 1,
                            backgroundColor: '#94A3B8',
                          }}
                        />
                      </View>
                    </View>
                    <View
                      style={{
                        width: 2,
                        height: isSel ? 4 : 3,
                        backgroundColor: '#475569',
                      }}
                    />
                  </View>
                )}

                {showLabel && (
                  <Text
                    style={{
                      fontSize: 10.5,
                      fontWeight: '800',
                      color: isSel
                        ? '#DB2777'
                        : isNight
                        ? '#E2E8F0'
                        : isRailOrMrt
                        ? '#5B21B6'
                        : '#047857',
                      textShadowColor: isNight
                        ? 'rgba(15, 23, 42, 0.92)'
                        : 'rgba(255, 255, 255, 0.96)',
                      textShadowOffset: { width: 0, height: 0 },
                      textShadowRadius: 3,
                      maxWidth: 105,
                    }}
                    numberOfLines={1}
                  >
                    {stop.stopType === 'mrt' ? `捷運${stop.name}` : stop.name}
                  </Text>
                )}
              </View>
            </Marker>
          );
        })}

        {/* P2 #11：YouBike 2.0 / 2.0E 即時站點標記（依縮放層級自適應密度：中距顯示精簡圓點、放大顯示完整可借可停） */}
        {uiState === 'browse' &&
          displayedYouBikeStations.map((st) => {
            const isSel = selectedYouBike?.id === st.id;
            const hasBikes = typeof st.availableBikes === 'number' && st.availableBikes > 0;
            const showFullDetail = isSel || activePoiCat === 'YouBike' || zoomLevel >= 16.0;
            return (
              <Marker
                key={st.id}
                id={`youbike-pin-${st.id}`}
                lngLat={[st.lon, st.lat]}
                anchor="bottom"
                onPress={() => {
                  lastMarkerTapTsRef.current = Date.now();
                  setSelectedYouBike(st);
                  setSelectedTransitStop(null);
                  setCategoryListOpen(false);
                  nav.setInspectedPlace(null);
                  setSheetCollapsed(false);
                  cameraRef.current?.easeTo({
                    center: [st.lon, st.lat],
                    zoom: Math.max(zoomLevel, 16.2),
                    duration: 380,
                  });
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 3,
                    backgroundColor: isSel ? '#EA580C' : hasBikes ? '#F59E0B' : '#94A3B8',
                    paddingHorizontal: isSel ? 7 : 5,
                    paddingVertical: isSel ? 3.5 : 2,
                    borderRadius: 10,
                    borderWidth: 1.2,
                    borderColor: '#FFFFFF',
                    shadowColor: '#000',
                    shadowOpacity: 0.18,
                    shadowRadius: 3,
                  }}
                >
                  <Ionicons name="bicycle" size={10} color="#FFFFFF" />
                  <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#FFFFFF' }}>
                    {showFullDetail
                      ? `${typeof st.availableBikes === 'number' ? st.availableBikes : '--'}/${
                          typeof st.availableReturnDocks === 'number' ? st.availableReturnDocks : '--'
                        }`
                      : `${typeof st.availableBikes === 'number' ? st.availableBikes : '--'}`}
                  </Text>
                </View>
              </Marker>
            );
          })}

        {/* GOBA 自建台灣 POI 地標層（Apple Maps 簡潔圓點 + 描邊文字風格，支援點擊查看詳情與導航） */}
        {uiState === 'browse' &&
          !activePoiCat &&
          zoomLevel >= 13.8 &&
          viewportPois.slice(0, 24).map((poi) => {
            const st = VIEWPORT_POI_STYLE[poi.category] || { icon: 'location', color: '#EC4899' };
            const isSel = nav.inspectedPlace?.id === poi.place_id || nav.inspectedPlace?.placeId === poi.place_id;
            const shortName = poi.name.length > 9 ? `${poi.name.slice(0, 8)}…` : poi.name;
            return (
              <Marker
                key={poi.place_id}
                id={`goba-poi-${poi.place_id}`}
                lngLat={[poi.lon, poi.lat]}
                anchor="center"
                onPress={() => {
                  lastMarkerTapTsRef.current = Date.now();
                  setSelectedTransitStop(null);
                  setSelectedYouBike(null);
                  setCategoryListOpen(false);
                  nav.setInspectedPlace({
                    id: poi.place_id,
                    placeId: poi.place_id,
                    name: poi.name,
                    address: poi.address || `${poi.city}${poi.district}` || '台灣',
                    city: poi.city || undefined,
                    district: poi.district || undefined,
                    lat: poi.lat,
                    lon: poi.lon,
                    category: poi.category,
                    phone: poi.phone || undefined,
                    openingHours: poi.opening_hours || undefined,
                    source: 'goba_taiwan_pois',
                  });
                  setSheetCollapsed(false);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3.5 }}>
                  <View
                    style={{
                      width: isSel ? 22 : 18,
                      height: isSel ? 22 : 18,
                      borderRadius: isSel ? 11 : 9,
                      backgroundColor: isSel ? '#EC4899' : st.color,
                      borderWidth: 1.2,
                      borderColor: '#FFFFFF',
                      alignItems: 'center',
                      justifyContent: 'center',
                      shadowColor: '#000',
                      shadowOpacity: 0.2,
                      shadowRadius: 2.5,
                      elevation: 3,
                    }}
                  >
                    <Ionicons
                      name={st.icon as any}
                      size={isSel ? 11 : 9.5}
                      color="#FFFFFF"
                    />
                  </View>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: isSel ? '800' : '700',
                      color: isSel ? '#EC4899' : isNight ? '#F8FAFC' : st.color,
                      textShadowColor: isNight
                        ? 'rgba(15, 23, 42, 0.94)'
                        : 'rgba(255, 255, 255, 0.96)',
                      textShadowOffset: { width: 0, height: 0 },
                      textShadowRadius: 3.5,
                    }}
                    numberOfLines={1}
                  >
                    {shortName}
                  </Text>
                </View>
              </Marker>
            );
          })}

        {/* 導航中下一個轉彎路口高亮點（Priority 1.6） */}
        {nextTurnCoord && (
          <Marker id="goba-next-turn-node" lngLat={nextTurnCoord} anchor="center">
            <View style={styles.nextTurnNodeOuter}>
              <View style={styles.nextTurnNodeInner}>
                <ManeuverArrowIcon
                  type={nav.progress?.nextManeuver?.type ?? nav.route?.maneuvers[1]?.type ?? 8}
                  size={15}
                  color="#831843"
                />
              </View>
            </View>
          </Marker>
        )}

        {/* 導航中 3D 車輛指向游標（車頭視角時固定朝上，2D 自由北向模式時依實際車頭方位角旋轉） */}
        {uiState === 'navigation' && vehicleDisplayCoord && (
          <Marker id="goba-vehicle-puck" lngLat={vehicleDisplayCoord} anchor="center">
            <View style={styles.vehiclePuckHalo}>
              <View style={[styles.vehiclePuckCore, { borderColor: activeProfile.routeColor }]}>
                <Ionicons
                  name={
                    (NAV_CURSOR_SKINS.find((s) => s.id === cursorSkin)?.icon || 'navigate') as any
                  }
                  size={20}
                  color={
                    NAV_CURSOR_SKINS.find((s) => s.id === cursorSkin)?.color || activeProfile.routeColor
                  }
                  style={{
                    transform: [
                      {
                        rotate:
                          cursorSkin === 'arrow'
                            ? `${
                                nav.followMode === 'course'
                                  ? -45
                                  : Math.round((nav.gps?.headingDeg ?? 0) - 45)
                              }deg`
                            : '0deg',
                      },
                    ],
                  }}
                />
              </View>
            </View>
          </Marker>
        )}

        {/* Browse 模式附近 POI 標記（依縮放等級自動合併過密標記，確保滑動流暢） */}
        {uiState === 'browse' &&
          displayedNearbyPins.map((pin) => (
            <Marker
              key={pin.id}
              id={`poi-${pin.id}`}
              lngLat={[pin.lon, pin.lat]}
              anchor="bottom"
              onPress={() => handleMarkerSelectPlace(pin)}
            >
              <View style={styles.poiPinWrap}>
                <View style={styles.poiPinBubble}>
                  <Ionicons name="location" size={14} color="#FFFFFF" />
                </View>
                <Text style={styles.poiPinLabel} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  {pin.name}
                </Text>
              </View>
            </Marker>
          ))}

        {/* 選取地點或目的地標記 */}
        {(nav.destination || nav.inspectedPlace) && (
          <Marker
            id="goba-destination-marker"
            lngLat={[
              (nav.destination || nav.inspectedPlace)!.lon,
              (nav.destination || nav.inspectedPlace)!.lat,
            ]}
            anchor="bottom"
          >
            <View style={styles.destMarkerWrap}>
              <LinearGradient colors={['#F472B6', '#DB2777']} style={styles.destMarkerBadge}>
                <Ionicons name="flag" size={15} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.destMarkerTip} />
            </View>
          </Marker>
        )}
      </Map>

      {/* 測速預警全螢幕外框紅色閃爍提示（不遮擋地圖畫面） */}
      {shendunEnabled && uiState !== 'search' && activeCameraAlert && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderWidth: activeCameraAlert.isOverspeed ? 7 : 4.5,
              borderColor: '#EF4444',
              opacity: redPulseAnim,
              shadowColor: '#EF4444',
              shadowOpacity: 0.9,
              shadowRadius: 18,
            },
          ]}
        />
      )}

      {/* ==================== 頂部區塊（依四大狀態切換） ==================== */}
      <SafeAreaView style={styles.topOverlay} pointerEvents="box-none">
        {/* 狀態 1：Browse（Apple Maps 極簡風格：頂部僅保留左上角氣溫膠囊，搜尋列移至底部卡片） */}
        {uiState === 'browse' && (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <LiquidGlassSurface
                variant={isNight ? 'dark' : 'light'}
                interactive
                borderRadius={16}
                contentStyle={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Ionicons name="partly-sunny" size={14} color={isNight ? '#FBBF24' : '#64748B'} />
                <Text style={{ fontSize: 13, fontWeight: '700', color: isNight ? '#F8FAFC' : '#0F172A' }}>
                  {weatherTemp != null ? `${Math.round(weatherTemp)}°` : '22°'}
                </Text>
              </LiquidGlassSurface>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setShendunEnabled((v) => !v)}
              >
                <LiquidGlassSurface
                  variant={isNight ? 'dark' : 'light'}
                  interactive
                  borderRadius={16}
                  contentStyle={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 9,
                    paddingVertical: 5,
                  }}
                >
                  <Ionicons
                    name="shield-checkmark"
                    size={13}
                    color={shendunEnabled ? '#DC2626' : '#94A3B8'}
                  />
                  <Text
                    style={{
                      fontSize: 11.5,
                      fontWeight: '800',
                      color: shendunEnabled ? (isNight ? '#FCA5A5' : '#B91C1C') : '#94A3B8',
                    }}
                  >
                    {shendunEnabled ? '測速預警' : '預警關閉'}
                  </Text>
                </LiquidGlassSurface>
              </TouchableOpacity>
            </View>

            {showSearchAreaBtn && (
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={handleSearchThisArea}
              >
                <LiquidGlassSurface
                  variant="dark"
                  interactive
                  borderRadius={20}
                  contentStyle={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    paddingHorizontal: 14,
                    paddingVertical: 7,
                  }}
                >
                  <Ionicons name="refresh" size={13} color="#F472B6" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
                    搜尋這個區域
                  </Text>
                </LiquidGlassSurface>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* 狀態 3：Route Preview（頂部顯示起訖點摘要膠囊） */}
        {/* 狀態 3：Route Preview（P1 #8：支援自訂導航起點、目的地修改與交換起訖點按鈕） */}
        {uiState === 'route_preview' && (
          <LiquidGlassSurface variant={isNight ? 'dark' : 'light'} interactive borderRadius={22}>
            <View style={[styles.previewTopBar, { paddingVertical: 8 }]}>
              <TouchableOpacity
                style={styles.capsuleBackBtn}
                onPress={() => {
                  const dest = nav.destination;
                  nav.clearRoute();
                  if (dest) nav.setInspectedPlace(dest);
                }}
              >
                <Ionicons
                  name="chevron-back"
                  size={22}
                  color={isNight ? '#F8FAFC' : '#1F2937'}
                />
              </TouchableOpacity>
              <View style={{ flex: 1, gap: 5 }}>
                {/* 可點擊修改起點（預設目前位置） */}
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => {
                    setEditingOriginMode(true);
                    handleOpenSearch();
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    backgroundColor: isNight ? 'rgba(255,255,255,0.08)' : 'rgba(219,39,119,0.06)',
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 10,
                  }}
                >
                  <View
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: nav.isCustomOrigin ? '#0EA5E9' : '#10B981',
                    }}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: isNight ? '#E2E8F0' : '#374151',
                      flex: 1,
                    }}
                    numberOfLines={1}
                  >
                    {nav.customOrigin ? nav.customOrigin.name : '目前位置（點擊修改起點）'}
                  </Text>
                  {nav.isCustomOrigin && (
                    <TouchableOpacity
                      onPress={() => nav.setCustomOrigin(null)}
                      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    >
                      <Ionicons name="locate" size={14} color="#0EA5E9" />
                    </TouchableOpacity>
                  )}
                </TouchableOpacity>

                {/* 中途停靠點清單 + 新增停靠點 */}
                {nav.waypoints.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 6, alignItems: 'center' }}
                  >
                    {nav.waypoints.map((wp, wpIdx) => (
                      <View
                        key={wp.id}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          backgroundColor: isNight ? 'rgba(236,72,153,0.18)' : 'rgba(236,72,153,0.10)',
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 8,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '700',
                            color: isNight ? '#F9A8D4' : '#9D174D',
                            maxWidth: 110,
                          }}
                          numberOfLines={1}
                        >
                          停靠{wpIdx + 1}: {wp.name}
                        </Text>
                        <TouchableOpacity
                          onPress={() => nav.removeWaypoint(wp.id)}
                          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                        >
                          <Ionicons name="close-circle" size={13} color="#EC4899" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </ScrollView>
                )}

                {/* 可點擊修改目的地 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    onPress={() => {
                      setEditingOriginMode(false);
                      setAddingWaypointMode(false);
                      handleOpenSearch();
                    }}
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                      backgroundColor: isNight ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.04)',
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 10,
                    }}
                  >
                    <Ionicons name="location" size={12} color="#DB2777" />
                    <Text
                      style={[
                        styles.previewDestTitle,
                        { fontSize: 13, flex: 1 },
                        isNight && { color: '#FFFFFF' },
                      ]}
                      numberOfLines={1}
                    >
                      {nav.destination?.name || '規劃目的地'}
                    </Text>
                  </TouchableOpacity>
                  {nav.waypoints.length < 5 && (
                    <TouchableOpacity
                      onPress={() => {
                        setEditingOriginMode(false);
                        setAddingWaypointMode(true);
                        handleOpenSearch();
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 2,
                        backgroundColor: isNight ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.06)',
                        paddingHorizontal: 8,
                        paddingVertical: 5,
                        borderRadius: 10,
                      }}
                    >
                      <Ionicons name="add" size={14} color={isNight ? '#F9A8D4' : '#DB2777'} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: isNight ? '#F9A8D4' : '#DB2777' }}>
                        停靠點
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* 交換起點與終點按鈕 */}
              <TouchableOpacity
                style={[styles.capsuleBackBtn, { marginLeft: 4 }]}
                onPress={() => nav.swapOriginAndDestination()}
                accessibilityLabel="交換起點與終點"
              >
                <Ionicons name="swap-vertical" size={20} color="#EC4899" />
              </TouchableOpacity>
            </View>
          </LiquidGlassSurface>
        )}

        {/* 狀態 4：Navigation（高德風格深色轉向看板 + 左側車速圓徽章 + 複雜路口放大指引） */}
        {uiState === 'navigation' && isActiveNav && (
          <NavHudOverlay
            nextManeuver={nav.progress?.nextManeuver ?? null}
            thenManeuver={nav.progress?.thenManeuver ?? null}
            fallbackFirstManeuver={nav.route?.maneuvers[0] ?? null}
            distanceToNextTurnMeters={nav.progress?.distanceToNextTurnMeters ?? 0}
            speedKmh={nav.speedKmh}
            phase={nav.phase}
            commandState={nav.commandState}
            remainingTrafficSignalCount={nav.progress?.remainingTrafficSignalCount ?? null}
            routeTrafficSignalCount={nav.route?.trafficSignalCount ?? 0}
            distanceToNextTrafficSignalMeters={
              nav.progress?.distanceToNextTrafficSignalMeters ?? null
            }
            headingUnverified={Boolean(nav.route?.headingUnverified)}
            gpsSignalLost={nav.gpsSignalLost}
            gpsWeakSignal={nav.gpsWeakSignal}
            gpsAccuracyMeters={nav.gps?.accuracyMeters ?? null}
            rerouteOfflinePending={nav.rerouteOfflinePending}
            isSimulating={nav.isSimulating}
            bgLocationActive={nav.bgLocationActive}
            voiceEnabled={nav.voiceEnabled}
            voiceMode={nav.voiceMode}
            isNight={isNight}
            activeCameraAlert={shendunEnabled ? activeCameraAlert : null}
            onToggleVoice={nav.toggleVoice}
            onCycleVoiceMode={nav.cycleVoiceMode}
            onRetryOfflineReroute={() => {
              if (nav.gps) {
                nav.triggerOffRouteReroute({ lat: nav.gps.lat, lon: nav.gps.lon });
              }
            }}
          />
        )}

        {(nav.errorMessage || nav.gpsPermission === 'denied') && uiState !== 'search' && (
          <LiquidGlassSurface variant="light" borderRadius={16} contentStyle={styles.bannerError}>
            <Ionicons name="alert-circle" size={16} color="#DC2626" />
            <Text style={styles.bannerErrorText} maxFontSizeMultiplier={1.2}>
              {nav.errorMessage || '尚未取得 GPS 定位權限，目前使用預設區域座標規劃路線。'}
            </Text>
            {nav.gpsPermission === 'denied' && (
              <TouchableOpacity
                onPress={() => Linking.openSettings().catch(() => {})}
                style={styles.openSettingsBtn}
              >
                <Text style={styles.openSettingsBtnText}>開啟設定</Text>
              </TouchableOpacity>
            )}
          </LiquidGlassSurface>
        )}
        {/* 瀏覽巡航模式下僅在行駛中顯示超精簡測速小膠囊，不遮擋地圖 */}
        {shendunEnabled && uiState === 'browse' && activeCameraAlert && (
          <View style={{ marginTop: 6, alignSelf: 'flex-start' }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                backgroundColor: activeCameraAlert.isOverspeed
                  ? 'rgba(220, 38, 38, 0.94)'
                  : 'rgba(15, 23, 42, 0.88)',
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: 16,
                borderWidth: 1.5,
                borderColor: '#EF4444',
              }}
            >
              <Ionicons name="camera" size={13} color="#FFFFFF" />
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFFFFF' }}>
                前方 {Math.round(activeCameraAlert.distanceM)}m 測速
                {activeCameraAlert.camera.speed_limit_kmh
                  ? ` · 限速 ${activeCameraAlert.camera.speed_limit_kmh}`
                  : ''}
              </Text>
            </View>
          </View>
        )}
      </SafeAreaView>

      {/* ==================== 右側控制列（導航時隱藏，改由右側垂直進度條與頂/底高德看板控制，絕不重疊） ==================== */}
      {uiState !== 'search' && uiState !== 'navigation' && (
        <View
          style={[
            styles.rightDockWrap,
            uiState === 'browse' && {
              top: Platform.OS === 'ios' ? 116 : 96,
              bottom: undefined,
            },
          ]}
        >
          {(
            /* Browse / Route Preview 時保留：定位、日間/夜間圖層與設定 */
            <LiquidGlassSurface
              variant={isNight ? 'dark' : 'light'}
              interactive
              borderRadius={22}
            >
              <TouchableOpacity
                style={styles.dockBtn}
                onPress={handleCycleFollowMode}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={followIconName as any}
                  size={19}
                  color={
                    nav.followMode !== 'free'
                      ? '#EC4899'
                      : isNight
                      ? '#F8FAFC'
                      : '#1F2937'
                  }
                />
              </TouchableOpacity>
              <View style={styles.dockDivider} />
              <TouchableOpacity
                style={styles.dockBtn}
                onPress={cycleThemePref}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={
                    isPinkTheme
                      ? 'color-palette'
                      : isNight
                      ? 'moon'
                      : themePref === 'auto'
                      ? 'contrast-outline'
                      : 'sunny-outline'
                  }
                  size={19}
                  color={isPinkTheme || isNight ? '#F472B6' : '#1F2937'}
                />
              </TouchableOpacity>
              <View style={styles.dockDivider} />
              <TouchableOpacity
                style={styles.dockBtn}
                onPress={() => setExtrasModalOpen(true)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="sparkles"
                  size={19}
                  color={tripShareUrl ? '#10B981' : isNight ? '#F8FAFC' : '#1F2937'}
                />
              </TouchableOpacity>
              <View style={styles.dockDivider} />
              <TouchableOpacity
                style={styles.dockBtn}
                onPress={() => {
                  const next = !showSettingsPanel;
                  setShowSettingsPanel(next);
                  if (next) {
                    fetchAdminFeedbackQueue().then(setAdminQueue);
                  }
                }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="options-outline"
                  size={18}
                  color={showSettingsPanel ? '#EC4899' : isNight ? '#F8FAFC' : '#1F2937'}
                />
              </TouchableOpacity>
            </LiquidGlassSurface>
          )}
        </View>
      )}

      {/* 語音設定與隱私安全診斷面板 */}
      {showSettingsPanel && uiState !== 'search' && (
        <View style={styles.settingsOverlay}>
          <LiquidGlassSurface
            variant={isNight ? 'dark' : 'light'}
            borderRadius={22}
            contentStyle={{ padding: 16, gap: 10 }}
          >
            <View style={styles.settingsHeader}>
              <Text
                style={[styles.settingsTitle, isNight && { color: '#FFFFFF' }]}
                maxFontSizeMultiplier={1.2}
              >
                導航設定與系統診斷
              </Text>
              <TouchableOpacity onPress={() => setShowSettingsPanel(false)}>
                <Ionicons name="close-circle" size={22} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <TouchableOpacity style={styles.optChip} onPress={nav.cycleVoiceRate}>
                <Text style={styles.optChipText}>
                  語速：{nav.voiceRate < 0.95 ? '慢速' : nav.voiceRate > 1.05 ? '快速' : '標準'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.optChip} onPress={nav.testVoiceGuidance}>
                <Text style={styles.optChipText}>測試語音播報</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.optChip}
                onPress={cycleThemePref}
              >
                <Text style={styles.optChipText}>底圖：{themePrefLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.optChip}
                onPress={() => {
                  const idx = CAMERA_ALERT_LEAD_OPTIONS.indexOf(cameraLeadM as any);
                  const next = CAMERA_ALERT_LEAD_OPTIONS[(idx + 1) % CAMERA_ALERT_LEAD_OPTIONS.length];
                  setCameraLeadM(next);
                  void saveCameraAlertLeadMeters(next);
                }}
              >
                <Text style={styles.optChipText}>
                  📷 測速最早預警：{cameraLeadM}公尺{cameraLeadM === 300 ? ' (預設)' : ''}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optChip, showTrafficSignals && { backgroundColor: '#1F2937' }]}
                onPress={() => setShowTrafficSignals((prev) => !prev)}
              >
                <Text
                  style={[
                    styles.optChipText,
                    showTrafficSignals && { color: '#FFFFFF' },
                  ]}
                >
                  🚦 紅綠燈圖層：{showTrafficSignals ? '開啟' : '關閉'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optChip, { backgroundColor: '#FCE7F3' }]}
                onPress={async () => {
                  if (nav.speedKmh > 3 && !nav.isSimulating) {
                    Alert.alert('行車安全保護', '請於車輛靜止時或由乘客操作 GPS 軌跡回放測試。');
                    return;
                  }
                  const { runAllGpsReplayScenarios } = await import(
                    '../navigation/gpsReplayTester'
                  );
                  const res = runAllGpsReplayScenarios();
                  setReplayResults(res);
                }}
              >
                <Text style={[styles.optChipText, { color: '#9D174D' }]}>
                  ▶ 執行 15 項 GPS 軌跡回放驗收
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '600' }}>
              ⚠️ 駕駛人不得在行駛中操作測試介面，道路測試請由乘客協助記錄。
            </Text>

            {replayResults.length > 0 && (
              <>
                <Text style={styles.diagTitle}>
                  GPS 軌跡回放測試 ({replayResults.filter((r) => r.passed).length}/
                  {replayResults.length} 通過)
                </Text>
                <ScrollView style={{ maxHeight: 110 }}>
                  {replayResults.map((r) => (
                    <Text
                      key={r.id}
                      style={[styles.diagRowText, isNight && { color: '#CBD5E1' }]}
                    >
                      {r.passed ? '✅' : '❌'} {r.name}{' '}
                      {r.firstVoiceAction ? `→「${r.firstVoiceAction}」` : ''}
                    </Text>
                  ))}
                </ScrollView>
              </>
            )}

            <Text style={styles.diagTitle}>
              效能監測（首次載入 / 搜尋 / 2D-3D / 快取命中）
            </Text>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                gap: 6,
                backgroundColor: 'rgba(15,23,42,0.04)',
                padding: 8,
                borderRadius: 10,
              }}
            >
              <Text style={styles.diagRowText}>
                🗺️ 首次開圖：{mapFirstLoadMs !== null ? `${mapFirstLoadMs}ms` : '載入中'}
              </Text>
              <Text style={styles.diagRowText}>
                🔍 搜尋：{searchLatencyMs !== null ? `${searchLatencyMs}ms` : `${mapApiPerfCounters.lastSearchLatencyMs}ms`}
              </Text>
              <Text style={styles.diagRowText}>
                📐 2D/3D：{toggle2D3DMs !== null ? `${toggle2D3DMs}ms` : '待測'}
              </Text>
              <Text style={styles.diagRowText}>
                ⚡ API：{mapApiPerfCounters.apiRequests} 次 / 快取命中：{mapApiPerfCounters.cacheHits} 次
              </Text>
            </View>

            <Text style={styles.diagTitle}>
              語音播報紀錄 ({nav.voiceHistory.length} 筆) & 偏航重算延遲 ({nav.rerouteMetrics.length} 次)
            </Text>
            <ScrollView style={{ maxHeight: 95 }}>
              {nav.rerouteMetrics.slice(0, 3).map((m) => (
                <Text
                  key={m.id}
                  style={[styles.diagRowText, { color: '#059669', fontWeight: '700' }]}
                >
                  ⚡ [{m.reason}] 偵測 {m.detectionLatencyMs}ms / API {m.apiLatencyMs}ms / UI{' '}
                  {m.uiUpdateLatencyMs}ms
                </Text>
              ))}
              {nav.voiceHistory.length === 0 ? (
                <Text style={{ fontSize: 11, color: '#9CA3AF' }}>尚無語音播報紀錄</Text>
              ) : (
                nav.voiceHistory.slice(0, 6).map((v) => (
                  <Text
                    key={v.id}
                    style={[styles.diagRowText, isNight && { color: '#CBD5E1' }]}
                  >
                    🔊 [{v.stage}/{v.speedKmh}km/h/{v.distanceMeters}m] {v.text}
                  </Text>
                ))
              )}
            </ScrollView>

            <Text style={styles.diagTitle}>
              待審核地點回報佇列 ({adminQueue.filter((f) => f.status === 'pending').length} 筆)
            </Text>
            <ScrollView style={{ maxHeight: 110 }}>
              {adminQueue.filter((f) => f.status === 'pending').length === 0 ? (
                <Text style={{ fontSize: 11, color: '#9CA3AF' }}>目前無待審核地點回報</Text>
              ) : (
                adminQueue
                  .filter((f) => f.status === 'pending')
                  .slice(0, 5)
                  .map((fb) => (
                    <View
                      key={fb.feedback_id}
                      style={{
                        paddingVertical: 6,
                        borderBottomWidth: StyleSheet.hairlineWidth,
                        borderBottomColor: 'rgba(0,0,0,0.08)',
                        gap: 3,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#111827' }}>
                        #{fb.feedback_id} [{fb.issue_type}] {fb.proposed_changes?.name || fb.place_id}
                      </Text>
                      <Text style={{ fontSize: 10, color: '#6B7280' }}>
                        新址：{fb.proposed_changes?.address || '未變更'}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
                        <TouchableOpacity
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 6,
                            backgroundColor: '#10B981',
                          }}
                          onPress={async () => {
                            await reviewAdminFeedback(
                              fb.feedback_id,
                              'approve',
                              '經後台核實通過並更新索引'
                            );
                            const refreshed = await fetchAdminFeedbackQueue();
                            setAdminQueue(refreshed);
                            Alert.alert('已核准更新', 'POI 索引已更新並清除舊快取！');
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>
                            核准更新
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{
                            paddingHorizontal: 8,
                            paddingVertical: 3,
                            borderRadius: 6,
                            backgroundColor: '#EF4444',
                          }}
                          onPress={async () => {
                            await reviewAdminFeedback(fb.feedback_id, 'reject', '資料待補充');
                            const refreshed = await fetchAdminFeedbackQueue();
                            setAdminQueue(refreshed);
                          }}
                        >
                          <Text style={{ fontSize: 10, fontWeight: '700', color: '#FFFFFF' }}>
                            駁回
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ))
              )}
            </ScrollView>

            <Text style={styles.diagTitle}>隱私安全診斷紀錄（不含任何座標資訊）</Text>
            <ScrollView style={{ maxHeight: 100 }}>
              {nav.getDiagnostics().length === 0 ? (
                <Text style={{ fontSize: 11, color: '#9CA3AF' }}>系統運作正常，無異常事件</Text>
              ) : (
                nav.getDiagnostics().slice(0, 6).map((d) => (
                  <Text
                    key={d.id}
                    style={[styles.diagRowText, isNight && { color: '#CBD5E1' }]}
                  >
                    • [{new Date(d.timestamp).toLocaleTimeString()}] {d.type} ({d.code})
                    {d.latencyMs ? ` ${d.latencyMs}ms` : ''}
                  </Text>
                ))
              )}
            </ScrollView>
          </LiquidGlassSurface>
        </View>
      )}

      {/* 導航中手勢拖曳後顯示「回到車頭視角」按鈕（車速已移至左上角高德圓徽章，不重複顯示） */}
      {uiState === 'navigation' && isActiveNav && nav.followMode !== 'course' && (
        <TouchableOpacity
          style={[styles.recenterWrap, { bottom: 108 }]}
          onPress={handleRecenterCockpit}
          activeOpacity={0.85}
        >
          <LiquidGlassSurface
            variant={isNight ? 'dark' : 'light'}
            interactive
            borderRadius={22}
            contentStyle={styles.recenterInner}
          >
            <Ionicons name="navigate" size={15} color={isNight ? '#F472B6' : '#DB2777'} />
            <Text style={[styles.recenterText, !isNight && { color: '#0F172A' }]}>回到車頭視角</Text>
          </LiquidGlassSurface>
        </TouchableOpacity>
      )}

      {/* ==================== 狀態 2：Search（全螢幕 Liquid Glass 搜尋專頁） ==================== */}
      {uiState === 'search' && (
        <View style={styles.searchSheetOverlay}>
          <LiquidGlassSurface
            variant={isNight ? 'dark' : 'light'}
            borderRadius={0}
            style={{ flex: 1 }}
            contentStyle={{ flex: 1 }}
          >
            <SafeAreaView style={styles.searchSheetSafe}>
              {/* 搜尋頂部輸入列 */}
              <View style={styles.searchModalHeader}>
                <View
                  style={[
                    styles.searchModalInputBox,
                    isNight && { backgroundColor: 'rgba(255,255,255,0.1)' },
                  ]}
                >
                  <Ionicons name="search" size={18} color="#EC4899" />
                  <TextInput
                    ref={searchInputRef}
                    style={[styles.searchInput, isNight && { color: '#FFFFFF' }]}
                    placeholder={
                      bindingAnchorSlot === 'home'
                        ? '輸入您的「住家」地址或地標...'
                        : bindingAnchorSlot === 'work'
                        ? '輸入您的「公司」地址或地標...'
                        : '搜尋台灣地點、商店或門牌...'
                    }
                    placeholderTextColor="#9CA3AF"
                    value={searchQuery}
                    onChangeText={handleQueryChange}
                    returnKeyType="search"
                    onSubmitEditing={handleSearchSubmit}
                    autoFocus
                  />
                  {searching ? (
                    <ActivityIndicator size="small" color="#EC4899" />
                  ) : searchQuery.length > 0 ? (
                    <TouchableOpacity
                      onPress={() => {
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                    >
                      <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                <TouchableOpacity onPress={handleCloseSearch} style={styles.cancelSearchBtn}>
                  <Text style={styles.cancelSearchText} maxFontSizeMultiplier={1.2}>
                    取消
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.searchSheetScroll}
              >
                {/* 住家與公司快捷設定列（Priority 2.2） */}
                {!bindingAnchorSlot && searchQuery.trim().length === 0 && (
                  <View style={styles.commuteRow}>
                    <TouchableOpacity
                      style={[
                        styles.commuteCard,
                        isNight && { backgroundColor: 'rgba(255,255,255,0.08)' },
                      ]}
                      onPress={() =>
                        nav.commuteAnchors.home
                          ? handleSelectPlaceFromSearch(nav.commuteAnchors.home)
                          : setBindingAnchorSlot('home')
                      }
                      onLongPress={() => setBindingAnchorSlot('home')}
                    >
                      <View style={styles.commuteIconBox}>
                        <Ionicons name="home" size={18} color="#EC4899" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.commuteTitle, isNight && { color: '#FFFFFF' }]}
                          maxFontSizeMultiplier={1.2}
                        >
                          住家
                        </Text>
                        <Text style={styles.commuteSub} numberOfLines={1}>
                          {nav.commuteAnchors.home ? nav.commuteAnchors.home.name : '點擊設定'}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[
                        styles.commuteCard,
                        isNight && { backgroundColor: 'rgba(255,255,255,0.08)' },
                      ]}
                      onPress={() =>
                        nav.commuteAnchors.work
                          ? handleSelectPlaceFromSearch(nav.commuteAnchors.work)
                          : setBindingAnchorSlot('work')
                      }
                      onLongPress={() => setBindingAnchorSlot('work')}
                    >
                      <View style={[styles.commuteIconBox, { backgroundColor: '#EFF6FF' }]}>
                        <Ionicons name="briefcase" size={17} color="#3B82F6" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.commuteTitle, isNight && { color: '#FFFFFF' }]}
                          maxFontSizeMultiplier={1.2}
                        >
                          公司
                        </Text>
                        <Text style={styles.commuteSub} numberOfLines={1}>
                          {nav.commuteAnchors.work ? nav.commuteAnchors.work.name : '點擊設定'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  </View>
                )}

                {/* 即時搜尋結果（Section 八：顯示品牌、類別、核實狀態、地址、直線/行車距離、營業時間、電話、搬遷提示與路線按鈕） */}
                {searchResults.length > 0 ? (
                  <View style={styles.searchSection}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: 4,
                        marginBottom: 6,
                      }}
                    >
                      <Text style={styles.searchSectionLabel}>
                        搜尋依據：{searchBasis} ({searchResults.length} 筆)
                      </Text>
                      {searchLatencyMs !== null && (
                        <Text style={{ fontSize: 11, color: '#9CA3AF' }}>{searchLatencyMs} ms</Text>
                      )}
                    </View>
                    {searchResults.map((p) => {
                      const isClosed = p.businessStatus === 'closed_permanently';
                      const isVerified = p.verificationStatus === 'verified';
                      const hasRelocHistory = Array.isArray(p.history) && p.history.length > 0;
                      return (
                        <TouchableOpacity
                          key={p.id}
                          style={styles.searchItem}
                          onPress={() => handleSelectPlaceFromSearch(p)}
                        >
                          <View
                            style={[
                              styles.searchItemIcon,
                              isClosed && { backgroundColor: '#FEE2E2' },
                            ]}
                          >
                            <Ionicons
                              name={isClosed ? 'alert-circle' : 'location'}
                              size={16}
                              color={isClosed ? '#DC2626' : '#EC4899'}
                            />
                          </View>
                          <View style={{ flex: 1, gap: 2 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              <Text
                                style={[
                                  styles.searchItemTitle,
                                  isNight && { color: '#FFFFFF' },
                                  isClosed && { textDecorationLine: 'line-through', color: '#9CA3AF' },
                                ]}
                                numberOfLines={1}
                                maxFontSizeMultiplier={1.2}
                              >
                                {p.name}
                              </Text>
                              {isVerified && !isClosed && (
                                <View style={styles.verifiedMicroBadge}>
                                  <Ionicons name="checkmark-circle" size={11} color="#059669" />
                                  <Text style={styles.verifiedMicroText}>已核實</Text>
                                </View>
                              )}
                              {p.fuzzyMatch && !isClosed && (
                                <View
                                  style={[
                                    styles.verifiedMicroBadge,
                                    { backgroundColor: '#FEF3C7' },
                                  ]}
                                >
                                  <Text style={[styles.verifiedMicroText, { color: '#92400E' }]}>
                                    模糊建議
                                  </Text>
                                </View>
                              )}
                              {isClosed && (
                                <View style={styles.closedMicroBadge}>
                                  <Text style={styles.closedMicroText}>已停業</Text>
                                </View>
                              )}
                            </View>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                              {p.brand && (
                                <Text style={styles.brandTagText}>{p.brand}</Text>
                              )}
                              {typeof p.distanceKm === 'number' && (
                                <Text style={styles.searchDistText}>
                                  直線 {p.distanceKm.toFixed(1)} km
                                  {typeof p.estimatedDriveDistanceKm === 'number'
                                    ? ` • 行車約 ${p.estimatedDriveDistanceKm.toFixed(1)} km`
                                    : ''}
                                </Text>
                              )}
                            </View>

                            <Text
                              style={styles.searchItemAddr}
                              numberOfLines={1}
                              maxFontSizeMultiplier={1.2}
                            >
                              {p.address}
                            </Text>

                            {(p.openingHours || p.phone) && (
                              <Text style={styles.metaMicroText} numberOfLines={1}>
                                {p.openingHours ? `🕒 ${p.openingHours}` : ''}
                                {p.openingHours && p.phone ? '  •  ' : ''}
                                {p.phone ? `📞 ${p.phone}` : ''}
                              </Text>
                            )}

                            {hasRelocHistory && p.history![0]?.old_address && (
                              <Text style={styles.relocMicroText} numberOfLines={1}>
                                ✦ 已由舊址（{p.history![0].old_name || ''}{' '}
                                {p.history![0].old_address}）搬遷至此核實新址
                              </Text>
                            )}
                          </View>

                          <View style={{ paddingLeft: 4 }}>
                            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : searchQuery.trim().length > 0 && !searching ? (
                  <View style={styles.mascotEmptyBox}>
                    <Image source={GOBA_MASCOT} style={styles.mascotImg} />
                    <Text
                      style={[styles.mascotEmptyTitle, isNight && { color: '#FFFFFF' }]}
                      maxFontSizeMultiplier={1.2}
                    >
                      鍋巴找不到這個地點
                    </Text>
                    <Text style={styles.mascotEmptyDesc} maxFontSizeMultiplier={1.2}>
                      試試輸入完整台灣路名、商圈名稱，或直接新增缺少的店家資訊。
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
                      <TouchableOpacity style={styles.optChip} onPress={handleSearchSubmit}>
                        <Text style={styles.optChipText}>重試搜尋</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.optChip, { backgroundColor: '#FCE7F3' }]}
                        onPress={() => {
                          setIsSearchOpen(false);
                          handleOpenFeedbackModal(null);
                        }}
                      >
                        <Text style={[styles.optChipText, { color: '#9D174D' }]}>
                          + 回報缺少地點
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <>
                    {/* 收藏地點 */}
                    {nav.favoritePlaces.length > 0 && (
                      <View style={styles.searchSection}>
                        <Text style={styles.searchSectionLabel}>收藏地點</Text>
                        {nav.favoritePlaces.map((fav) => (
                          <TouchableOpacity
                            key={`fav-${fav.id}`}
                            style={styles.searchItem}
                            onPress={() => handleSelectPlaceFromSearch(fav)}
                          >
                            <View
                              style={[
                                styles.searchItemIcon,
                                { backgroundColor: 'rgba(236,72,153,0.14)' },
                              ]}
                            >
                              <Ionicons name="star" size={15} color="#EC4899" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[styles.searchItemTitle, isNight && { color: '#FFFFFF' }]}
                                numberOfLines={1}
                              >
                                {fav.name}
                              </Text>
                              <Text style={styles.searchItemAddr} numberOfLines={1}>
                                {fav.address}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    )}

                    {/* 最近搜尋 */}
                    {nav.recentPlaces.length > 0 ? (
                      <View style={styles.searchSection}>
                        <Text style={styles.searchSectionLabel}>最近搜尋</Text>
                        {nav.recentPlaces.map((rec) => (
                          <TouchableOpacity
                            key={`rec-${rec.id}`}
                            style={styles.searchItem}
                            onPress={() => handleSelectPlaceFromSearch(rec)}
                          >
                            <View
                              style={[
                                styles.searchItemIcon,
                                { backgroundColor: 'rgba(107,114,128,0.12)' },
                              ]}
                            >
                              <Ionicons name="time-outline" size={16} color="#6B7280" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text
                                style={[styles.searchItemTitle, isNight && { color: '#FFFFFF' }]}
                                numberOfLines={1}
                              >
                                {rec.name}
                              </Text>
                              <Text style={styles.searchItemAddr} numberOfLines={1}>
                                {rec.address}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : (
                      <View style={styles.mascotEmptyBox}>
                        <Image source={GOBA_MASCOT} style={styles.mascotImg} />
                        <Text
                          style={[styles.mascotEmptyTitle, isNight && { color: '#FFFFFF' }]}
                        >
                          今天想去哪裡呢？
                        </Text>
                        <Text style={styles.mascotEmptyDesc}>
                          搜尋全台灣地標、便利商店、百貨或完整門牌，鍋巴陪你安心出發！
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </ScrollView>
            </SafeAreaView>
          </LiquidGlassSurface>
        </View>
      )}

      {/* 導航中若已加入車隊：左側提供自由通話靜音鈕或按住對講（PTT）與車隊狀態鈕 */}
      {uiState === 'navigation' && isActiveNav && fleetState.fleet && (
        <View style={{ position: 'absolute', left: 12, top: 245, gap: 8, zIndex: 25 }}>
          {fleetState.fleet.voice_mode === 'open' ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => fleetState.setOpenMicMuted((m) => !m)}
              style={{
                backgroundColor: fleetState.openMicMuted
                  ? 'rgba(100, 116, 139, 0.90)'
                  : 'rgba(22, 163, 74, 0.92)',
                borderRadius: 22,
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                borderWidth: 1.5,
                borderColor: '#FFFFFF',
              }}
            >
              <Ionicons
                name={fleetState.openMicMuted ? 'mic-off' : 'mic'}
                size={18}
                color="#FFFFFF"
              />
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>
                {fleetState.openMicMuted ? '已靜音' : '自由通話中'}
              </Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={fleetState.fleet.voice_mode === 'leader_only' && !fleetState.isLeader}
              onPressIn={fleetState.startPttRecording}
              onPressOut={fleetState.stopAndSendPtt}
              style={{
                backgroundColor:
                  fleetState.fleet.voice_mode === 'leader_only' && !fleetState.isLeader
                    ? 'rgba(100, 116, 139, 0.85)'
                    : fleetState.isRecordingPtt
                    ? '#DC2626'
                    : 'rgba(15, 23, 42, 0.90)',
                borderRadius: 22,
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                borderWidth: 1.5,
                borderColor: fleetState.isRecordingPtt ? '#FCA5A5' : '#EC4899',
              }}
            >
              <Ionicons
                name={fleetState.isRecordingPtt ? 'mic' : 'mic-outline'}
                size={18}
                color="#FFFFFF"
              />
              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>
                {fleetState.fleet.voice_mode === 'leader_only' && !fleetState.isLeader
                  ? '僅隊長發言'
                  : fleetState.isRecordingPtt
                  ? '說話中…'
                  : '按住對講'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => setFleetModalOpen(true)}
            style={{
              backgroundColor: 'rgba(15, 23, 42, 0.84)',
              borderRadius: 16,
              paddingHorizontal: 10,
              paddingVertical: 6,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Ionicons name="people" size={14} color="#F9A8D4" />
            <Text style={{ color: '#F9A8D4', fontSize: 11, fontWeight: '700' }}>
              車隊 {fleetState.fleet.members.length}人
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 高德風格右側垂直路線進度條（僅在正式導航時顯示） */}
      {uiState === 'navigation' && isActiveNav && (
        <RouteProgressBar
          progressRatio={
            (nav.route?.distanceKm ?? 0) > 0
              ? Math.max(
                  0,
                  Math.min(1, 1 - remainingDistKm / Math.max(0.01, nav.route?.distanceKm ?? 1))
                )
              : 0
          }
          remainingTrafficSignalCount={
            nav.progress?.remainingTrafficSignalCount ?? nav.route?.trafficSignalCount ?? 0
          }
          onPress={() => {
            if (nav.followMode === 'free') {
              handleRecenterCockpit();
            } else {
              handleOverviewRoute();
            }
          }}
        />
      )}

      {/* ==================== 底部可收合動態資訊卡（Priority 2.5：依 Browse / Route Preview / Navigation 切換） ==================== */}
      {uiState !== 'search' && (
        <View
          {...sheetPanResponder.panHandlers}
          style={[
            styles.bottomSheetOuter,
            embeddedInTab && uiState === 'browse' && { bottom: 92 },
          ]}
        >
          <LiquidGlassSurface
            variant={isNight ? 'dark' : 'light'}
            borderRadius={uiState === 'navigation' && nav.phase !== 'arrived' ? 24 : 28}
            style={
              uiState === 'navigation' && nav.phase !== 'arrived'
                ? undefined
                : {
                    backgroundColor: isNight
                      ? 'rgba(15, 23, 42, 0.93)'
                      : 'rgba(255, 255, 255, 0.94)',
                  }
            }
            contentStyle={
              uiState === 'navigation' && nav.phase !== 'arrived'
                ? { padding: 0 }
                : styles.bottomSheetInner
            }
          >
            {/* 可收合拖曳把（導航模式不顯示外層拖曳條，保持一體成形高德底卡） */}
            {!(uiState === 'navigation' && nav.phase !== 'arrived') && (
              <TouchableOpacity
                style={styles.grabHandleHitBox}
                onPress={() => setSheetCollapsed((c) => !c)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.grabHandle,
                    isNight && { backgroundColor: 'rgba(255,255,255,0.24)' },
                  ]}
                />
              </TouchableOpacity>
            )}

            {/* ---------- 狀態 A：Browse（公車站牌 / YouBike / 地點詳情 / 分類多筆結果清單 / 快捷通勤） ---------- */}
            {uiState === 'browse' && (
              <>
                {selectedTransitStop ? (
                  <View style={{ gap: 10 }}>
                    <View style={styles.routeHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <View style={[styles.placeCatBadge, { backgroundColor: '#DBEAFE' }]}>
                            <Text style={[styles.placeCatBadgeText, { color: '#1D4ED8' }]}>
                              🚌 {selectedTransitStop.directionLabel}
                            </Text>
                          </View>
                          {typeof selectedTransitStop.distanceKm === 'number' && (
                            <Text style={styles.placeDistLabel}>
                              距離 {selectedTransitStop.distanceKm.toFixed(2)} km
                            </Text>
                          )}
                        </View>
                        <Text
                          style={[styles.placeDetailTitle, isNight && { color: '#FFFFFF' }]}
                          numberOfLines={1}
                        >
                          {selectedTransitStop.name}
                        </Text>
                        <Text style={styles.metaMicroText}>
                          站牌編號：{selectedTransitStop.id}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.closeSheetBtn}
                        onPress={() => setSelectedTransitStop(null)}
                      >
                        <Ionicons name="close" size={18} color="#6B7280" />
                      </TouchableOpacity>
                    </View>

                    {!sheetCollapsed && (
                      <>
                        <Text style={{ fontSize: 12, fontWeight: '800', color: isNight ? '#E2E8F0' : '#374151' }}>
                          停靠公車路線（
                          {liveTransitEta?.liveAvailable
                            ? liveTransitEta.routes.length
                            : selectedTransitStop.routes.length}
                          ）{liveTransitEta?.liveAvailable ? ' · 台北市即時動態' : ''}
                        </Text>
                        {(liveTransitEta?.liveAvailable
                          ? liveTransitEta.routes
                          : selectedTransitStop.routes
                        ).length === 0 ? (
                          <Text style={styles.metaMicroText}>
                            {liveTransitEta?.source || '此站牌尚無停靠路線明細（即時到站資訊暫時無法取得）'}
                          </Text>
                        ) : (
                          <ScrollView style={{ maxHeight: 160 }} contentContainerStyle={{ gap: 6 }}>
                            {(liveTransitEta?.liveAvailable
                              ? liveTransitEta.routes.map((r) => ({
                                  routeName: r.route_name,
                                  direction: r.direction,
                                  etaText: r.eta_text,
                                }))
                              : selectedTransitStop.routes
                            ).map((rt, rIdx) => (
                              <View
                                key={`${rt.routeName}-${rIdx}`}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  backgroundColor: isNight ? 'rgba(255,255,255,0.06)' : '#F8FAFC',
                                  paddingHorizontal: 10,
                                  paddingVertical: 8,
                                  borderRadius: 10,
                                  borderWidth: 1,
                                  borderColor: isNight ? 'rgba(255,255,255,0.1)' : '#E2E8F0',
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                  <View
                                    style={{
                                      backgroundColor: '#2563EB',
                                      paddingHorizontal: 8,
                                      paddingVertical: 3,
                                      borderRadius: 6,
                                    }}
                                  >
                                    <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800' }}>
                                      {rt.routeName}
                                    </Text>
                                  </View>
                                  <Text
                                    style={{ fontSize: 12, color: isNight ? '#CBD5E1' : '#334155', flex: 1 }}
                                    numberOfLines={1}
                                  >
                                    {rt.direction || '公車路線'}
                                  </Text>
                                </View>
                                <Text style={{ fontSize: 11, color: '#64748B' }}>{rt.etaText}</Text>
                              </View>
                            ))}
                          </ScrollView>
                        )}
                        <TouchableOpacity
                          activeOpacity={0.9}
                          style={{ marginTop: 4 }}
                          onPress={() => {
                            const st = selectedTransitStop;
                            setSelectedTransitStop(null);
                            nav.calculateRoute({
                              id: st.id,
                              placeId: st.id,
                              name: `${st.name} (${st.directionLabel})`,
                              address: `公車站牌 • ${st.directionLabel}`,
                              lat: st.lat,
                              lon: st.lon,
                              category: 'transit_station',
                            });
                          }}
                        >
                          <LinearGradient
                            colors={['#F472B6', '#DB2777']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.primaryGradBtn}
                          >
                            <Ionicons name="navigate" size={16} color="#FFFFFF" />
                            <Text style={styles.primaryBtnText}>設為目的地並規劃路線</Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                ) : selectedYouBike ? (
                  <View style={{ gap: 10 }}>
                    <View style={styles.routeHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <View style={[styles.placeCatBadge, { backgroundColor: '#FEF3C7' }]}>
                            <Text style={[styles.placeCatBadgeText, { color: '#B45309' }]}>
                              🚲 YouBike 2.0 / 2.0E
                            </Text>
                          </View>
                          {typeof selectedYouBike.distanceKm === 'number' && (
                            <Text style={styles.placeDistLabel}>
                              距離 {selectedYouBike.distanceKm.toFixed(2)} km
                            </Text>
                          )}
                        </View>
                        <Text
                          style={[styles.placeDetailTitle, isNight && { color: '#FFFFFF' }]}
                          numberOfLines={1}
                        >
                          {selectedYouBike.name}
                        </Text>
                        <Text style={styles.metaMicroText} numberOfLines={2}>
                          {selectedYouBike.address || selectedYouBike.area}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.closeSheetBtn}
                        onPress={() => setSelectedYouBike(null)}
                      >
                        <Ionicons name="close" size={18} color="#6B7280" />
                      </TouchableOpacity>
                    </View>

                    {!sheetCollapsed && (
                      <>
                        {!youBikeLiveAvailable ? (
                          <View
                            style={{
                              backgroundColor: '#FEF2F2',
                              padding: 10,
                              borderRadius: 10,
                            }}
                          >
                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#DC2626' }}>
                              ⚠️ {youBikeStatusMsg || '即時資訊暫時無法取得'}
                            </Text>
                          </View>
                        ) : (
                          <View style={{ flexDirection: 'row', gap: 8 }}>
                            <View
                              style={{
                                flex: 1,
                                backgroundColor: '#FFFBEB',
                                borderRadius: 12,
                                padding: 10,
                                alignItems: 'center',
                                borderWidth: 1,
                                borderColor: '#FDE68A',
                              }}
                            >
                              <Text style={{ fontSize: 11, color: '#92400E', fontWeight: '700' }}>
                                可借車輛
                              </Text>
                              <Text style={{ fontSize: 22, fontWeight: '900', color: '#D97706' }}>
                                {selectedYouBike.availableBikes ?? '--'}
                              </Text>
                              {(selectedYouBike.available20 !== null ||
                                selectedYouBike.available20E !== null) && (
                                <Text style={{ fontSize: 10, color: '#78350F', marginTop: 2 }}>
                                  2.0: {selectedYouBike.available20 ?? '--'} • 2.0E:{' '}
                                  {selectedYouBike.available20E ?? '--'}
                                </Text>
                              )}
                            </View>
                            <View
                              style={{
                                flex: 1,
                                backgroundColor: '#ECFDF5',
                                borderRadius: 12,
                                padding: 10,
                                alignItems: 'center',
                                borderWidth: 1,
                                borderColor: '#A7F3D0',
                              }}
                            >
                              <Text style={{ fontSize: 11, color: '#065F46', fontWeight: '700' }}>
                                可還空位
                              </Text>
                              <Text style={{ fontSize: 22, fontWeight: '900', color: '#059669' }}>
                                {selectedYouBike.availableReturnDocks ?? '--'}
                              </Text>
                              {selectedYouBike.totalDocks !== null && (
                                <Text style={{ fontSize: 10, color: '#047857', marginTop: 2 }}>
                                  總車柱：{selectedYouBike.totalDocks}
                                </Text>
                              )}
                            </View>
                          </View>
                        )}
                        <Text style={styles.metaMicroText}>
                          資料來源：{selectedYouBike.source} • 更新時間：{selectedYouBike.updatedAt || '--'}
                        </Text>
                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => {
                            const st = selectedYouBike;
                            setSelectedYouBike(null);
                            nav.calculateRoute({
                              id: st.id,
                              placeId: st.id,
                              name: st.name,
                              address: st.address,
                              lat: st.lat,
                              lon: st.lon,
                              category: 'youbike',
                            });
                          }}
                        >
                          <LinearGradient
                            colors={['#F472B6', '#DB2777']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.primaryGradBtn}
                          >
                            <Ionicons name="navigate" size={16} color="#FFFFFF" />
                            <Text style={styles.primaryBtnText}>導航前往此 YouBike 站點</Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                ) : nav.inspectedPlace ? (
                  <View style={{ gap: 10 }}>
                    {activePoiCat && (nearbyPins.length > 0 || youBikeStations.length > 0) && (
                      <TouchableOpacity
                        onPress={() => {
                          nav.setInspectedPlace(null);
                          setCategoryListOpen(true);
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}
                      >
                        <Ionicons name="chevron-back" size={14} color="#DB2777" />
                        <Text style={{ fontSize: 12, fontWeight: '700', color: '#DB2777' }}>
                          返回「{activePoiCat}」搜尋結果清單
                        </Text>
                      </TouchableOpacity>
                    )}
                    <View style={styles.routeHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <View style={styles.placeCatBadge}>
                            <Text style={styles.placeCatBadgeText}>
                              {nav.inspectedPlace.brand || nav.inspectedPlace.category || '台灣地標'}
                            </Text>
                          </View>
                          {nav.inspectedPlace.verificationStatus === 'verified' && (
                            <View style={styles.verifiedMicroBadge}>
                              <Ionicons name="checkmark-circle" size={11} color="#059669" />
                              <Text style={styles.verifiedMicroText}>已核實地點</Text>
                            </View>
                          )}
                          {nav.inspectedPlace.businessStatus === 'closed_permanently' && (
                            <View style={styles.closedMicroBadge}>
                              <Text style={styles.closedMicroText}>已結束營業</Text>
                            </View>
                          )}
                          {typeof nav.inspectedPlace.distanceKm === 'number' && (
                            <Text style={styles.placeDistLabel}>
                              直線 {nav.inspectedPlace.distanceKm.toFixed(1)} km
                              {typeof nav.inspectedPlace.estimatedDriveDistanceKm === 'number'
                                ? ` • 行車約 ${nav.inspectedPlace.estimatedDriveDistanceKm.toFixed(1)} km`
                                : ''}
                            </Text>
                          )}
                        </View>
                        <Text
                          style={[styles.placeDetailTitle, isNight && { color: '#FFFFFF' }]}
                          numberOfLines={1}
                          maxFontSizeMultiplier={1.25}
                        >
                          {nav.inspectedPlace.name}
                        </Text>
                        {!sheetCollapsed && (
                          <Text
                            style={styles.placeDetailAddr}
                            numberOfLines={2}
                            maxFontSizeMultiplier={1.2}
                          >
                            {nav.inspectedPlace.address}
                          </Text>
                        )}
                      </View>

                      <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                          style={styles.closeSheetBtn}
                          onPress={() => handleSharePlace(nav.inspectedPlace!)}
                        >
                          <Ionicons name="share-outline" size={17} color="#6B7280" />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.closeSheetBtn}
                          onPress={() => nav.handleToggleFavorite(nav.inspectedPlace!)}
                        >
                          <Ionicons
                            name={isPlaceFavorite(nav.inspectedPlace) ? 'star' : 'star-outline'}
                            size={17}
                            color={isPlaceFavorite(nav.inspectedPlace) ? '#EC4899' : '#6B7280'}
                          />
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.closeSheetBtn}
                          onPress={() => nav.setInspectedPlace(null)}
                        >
                          <Ionicons name="close" size={18} color="#6B7280" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {!sheetCollapsed && (
                      <>
                        {/* Section 四：重疊地標無法明確判定時，顯示候選地點切換清單 */}
                        {overlappingCandidates.length > 1 && (
                          <View style={{ gap: 4 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B7280' }}>
                              此位置附近有多個重疊地標，請確認要查看的地點：
                            </Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                              {overlappingCandidates.map((cand) => {
                                const selected = cand.id === nav.inspectedPlace?.id;
                                return (
                                  <TouchableOpacity
                                    key={cand.id}
                                    style={[
                                      styles.optChip,
                                      selected && { backgroundColor: '#DB2777' },
                                    ]}
                                    onPress={() => handleInspectPlaceOnMap(cand)}
                                  >
                                    <Text
                                      style={[
                                        styles.optChipText,
                                        selected && { color: '#FFFFFF' },
                                      ]}
                                    >
                                      {cand.name}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </ScrollView>
                          </View>
                        )}
                        {/* 營業資訊與電話（有可信資料時顯示，缺少資料時絕不顯示虛構內容） */}
                        {(nav.inspectedPlace.openingHours || nav.inspectedPlace.phone) && (
                          <View style={{ gap: 4 }}>
                            {nav.inspectedPlace.openingHours && (
                              <Text style={styles.metaMicroText}>
                                🕒 營業時間：{nav.inspectedPlace.openingHours}
                              </Text>
                            )}
                            {nav.inspectedPlace.phone && (
                              <TouchableOpacity
                                onPress={() =>
                                  Linking.openURL(`tel:${nav.inspectedPlace?.phone}`).catch(() => {})
                                }
                              >
                                <Text style={[styles.metaMicroText, { color: '#2563EB' }]}>
                                  📞 電話：{nav.inspectedPlace.phone}（點擊撥打）
                                </Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}

                        {/* 服務項目膠囊 */}
                        {Array.isArray(nav.inspectedPlace.services) &&
                          nav.inspectedPlace.services.length > 0 && (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                              {nav.inspectedPlace.services.slice(0, 5).map((svc, idx) => (
                                <View key={idx} style={styles.serviceMicroPill}>
                                  <Text style={styles.serviceMicroText}>{svc}</Text>
                                </View>
                              ))}
                            </View>
                          )}

                        {/* 歷史搬遷或改名核實紀錄（如味朋餐廳） */}
                        {Array.isArray(nav.inspectedPlace.history) &&
                          nav.inspectedPlace.history.length > 0 &&
                          nav.inspectedPlace.history[0]?.old_address && (
                            <View style={styles.warningStrip}>
                              <Ionicons name="checkmark-done-circle" size={15} color="#065F46" />
                              <Text style={[styles.warningStripText, { color: '#065F46' }]}>
                                搬遷核實紀錄：原「{nav.inspectedPlace.history[0].old_name || '舊址'}」（
                                {nav.inspectedPlace.history[0].old_address}）已核實搬遷至本新址。
                              </Text>
                            </View>
                          )}

                        <View style={styles.optionRow}>
                          <TouchableOpacity
                            style={styles.optChip}
                            onPress={() =>
                              nav.handleSetCommuteAnchor('home', nav.inspectedPlace!)
                            }
                          >
                            <Text style={styles.optChipText}>設為住家</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={styles.optChip}
                            onPress={() =>
                              nav.handleSetCommuteAnchor('work', nav.inspectedPlace!)
                            }
                          >
                            <Text style={styles.optChipText}>設為公司</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[styles.optChip, { backgroundColor: '#FEF3C7' }]}
                            onPress={() => handleOpenFeedbackModal(nav.inspectedPlace)}
                          >
                            <Text style={[styles.optChipText, { color: '#92400E' }]}>
                              回報地點錯誤
                            </Text>
                          </TouchableOpacity>
                        </View>

                        <TouchableOpacity
                          activeOpacity={0.9}
                          onPress={() => nav.calculateRoute(nav.inspectedPlace!)}
                        >
                          <LinearGradient
                            colors={['#F472B6', '#DB2777']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.primaryGradBtn}
                          >
                            <Ionicons name="navigate" size={16} color="#FFFFFF" />
                            <Text style={styles.primaryBtnText}>路線規劃</Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                ) : categoryListOpen && activePoiCat ? (
                  <View style={{ gap: 8 }}>
                    {/* P1 #1：Apple Maps / Google Maps 風格分類多筆結果清單（絕不自動選取第一筆或進入路線規劃） */}
                    <View style={styles.routeHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.placeDetailTitle, isNight && { color: '#FFFFFF' }]}>
                          {activePoiCat}（
                          {activePoiCat === 'YouBike'
                            ? youBikeStations.length
                            : nearbyPins.filter((p) => {
                                if (categoryFilterOpenNow && p.businessStatus === 'closed_permanently') return false;
                                if (categoryBrandFilter !== '全部' && p.brand !== categoryBrandFilter) return false;
                                return true;
                              }).length}{' '}
                          筆結果）
                        </Text>
                        <Text style={styles.metaMicroText}>
                          點擊任一地點查看詳情，或點右側按鈕規劃路線
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.closeSheetBtn}
                        onPress={() => {
                          setCategoryListOpen(false);
                          setActivePoiCat(null);
                          setNearbyPins([]);
                          setYouBikeStations([]);
                        }}
                      >
                        <Ionicons name="close" size={18} color="#6B7280" />
                      </TouchableOpacity>
                    </View>

                    {!sheetCollapsed && activePoiCat !== 'YouBike' && (
                      <>
                        {/* 篩選列：營業中、距離最近、品牌篩選 */}
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: 6 }}
                        >
                          <TouchableOpacity
                            style={[
                              styles.optChip,
                              categoryFilterOpenNow && { backgroundColor: '#DB2777' },
                            ]}
                            onPress={() => setCategoryFilterOpenNow((v) => !v)}
                          >
                            <Text
                              style={[
                                styles.optChipText,
                                categoryFilterOpenNow && { color: '#FFFFFF' },
                              ]}
                            >
                              營業中
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              styles.optChip,
                              categorySortBy === 'distance' && { backgroundColor: '#1F2937' },
                            ]}
                            onPress={() =>
                              setCategorySortBy((s) => (s === 'distance' ? 'relevance' : 'distance'))
                            }
                          >
                            <Text
                              style={[
                                styles.optChipText,
                                categorySortBy === 'distance' && { color: '#FFFFFF' },
                              ]}
                            >
                              {categorySortBy === 'distance' ? '距離最近 ✓' : '依相關度'}
                            </Text>
                          </TouchableOpacity>
                          {['全部', ...Array.from(new Set(nearbyPins.map((p) => p.brand).filter(Boolean) as string[])).slice(0, 6)].map(
                            (br) => {
                              const act = categoryBrandFilter === br;
                              return (
                                <TouchableOpacity
                                  key={br}
                                  style={[styles.optChip, act && { backgroundColor: '#FCE7F3' }]}
                                  onPress={() => setCategoryBrandFilter(br)}
                                >
                                  <Text style={[styles.optChipText, act && { color: '#9D174D' }]}>
                                    {br === '全部' ? '所有品牌' : br}
                                  </Text>
                                </TouchableOpacity>
                              );
                            }
                          )}
                        </ScrollView>

                        <ScrollView style={{ maxHeight: 250 }} contentContainerStyle={{ gap: 8 }}>
                          {nearbyPins
                            .filter((p) => {
                              if (categoryFilterOpenNow && p.businessStatus === 'closed_permanently') return false;
                              if (categoryBrandFilter !== '全部' && p.brand !== categoryBrandFilter) return false;
                              return true;
                            })
                            .sort((a, b) =>
                              categorySortBy === 'distance'
                                ? (a.distanceKm ?? 99) - (b.distanceKm ?? 99)
                                : 0
                            )
                            .map((item) => {
                              const estMin = Math.max(
                                1,
                                Math.round(((item.estimatedDriveDistanceKm ?? item.distanceKm ?? 0.5) / 30) * 60)
                              );
                              return (
                                <TouchableOpacity
                                  key={item.id}
                                  activeOpacity={0.8}
                                  onPress={() => {
                                    setCategoryListOpen(false);
                                    handleInspectPlaceOnMap(item);
                                  }}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    backgroundColor: isNight ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
                                    borderRadius: 14,
                                    padding: 10,
                                    borderWidth: 1,
                                    borderColor: isNight ? 'rgba(255,255,255,0.1)' : '#F3F4F6',
                                    gap: 10,
                                  }}
                                >
                                  <View style={{ flex: 1 }}>
                                    <Text
                                      style={{
                                        fontSize: 14,
                                        fontWeight: '800',
                                        color: isNight ? '#FFFFFF' : '#111827',
                                      }}
                                      numberOfLines={1}
                                    >
                                      {item.name}
                                    </Text>
                                    <Text
                                      style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }}
                                      numberOfLines={1}
                                    >
                                      {typeof item.distanceKm === 'number'
                                        ? item.distanceKm < 1
                                          ? `${Math.round(item.distanceKm * 1000)} 公尺`
                                          : `${item.distanceKm.toFixed(1)} 公里`
                                        : ''}
                                      {item.address ? ` • ${item.address}` : ''}
                                    </Text>
                                    <Text style={{ fontSize: 11, color: '#059669', marginTop: 2, fontWeight: '600' }}>
                                      {item.openingHours ? item.openingHours : item.businessStatus === 'closed_permanently' ? '已結束營業' : '營業狀態依現場為準'}
                                    </Text>
                                  </View>
                                  <TouchableOpacity
                                    onPress={() => {
                                      setCategoryListOpen(false);
                                      nav.calculateRoute(item);
                                    }}
                                    style={{
                                      backgroundColor: '#FCE7F3',
                                      paddingHorizontal: 10,
                                      paddingVertical: 8,
                                      borderRadius: 12,
                                      alignItems: 'center',
                                    }}
                                  >
                                    <Ionicons name="navigate" size={14} color="#DB2777" />
                                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#9D174D', marginTop: 2 }}>
                                      約 {estMin} 分
                                    </Text>
                                  </TouchableOpacity>
                                </TouchableOpacity>
                              );
                            })}
                        </ScrollView>
                      </>
                    )}

                    {!sheetCollapsed && activePoiCat === 'YouBike' && (
                      <ScrollView style={{ maxHeight: 260 }} contentContainerStyle={{ gap: 8 }}>
                        {!youBikeLiveAvailable ? (
                          <Text style={{ fontSize: 12, color: '#DC2626', fontWeight: '700' }}>
                            ⚠️ {youBikeStatusMsg || '即時資訊暫時無法取得'}
                          </Text>
                        ) : (
                          youBikeStations.map((st) => (
                            <TouchableOpacity
                              key={st.id}
                              activeOpacity={0.8}
                              onPress={() => {
                                setCategoryListOpen(false);
                                setSelectedYouBike(st);
                                cameraRef.current?.easeTo({
                                  center: [st.lon, st.lat],
                                  zoom: 16.5,
                                  duration: 380,
                                });
                              }}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                backgroundColor: isNight ? 'rgba(255,255,255,0.06)' : '#FFFFFF',
                                borderRadius: 14,
                                padding: 10,
                                borderWidth: 1,
                                borderColor: '#FDE68A',
                                gap: 10,
                              }}
                            >
                              <View style={{ flex: 1 }}>
                                <Text
                                  style={{ fontSize: 13, fontWeight: '800', color: isNight ? '#FFFFFF' : '#111827' }}
                                  numberOfLines={1}
                                >
                                  {st.name}
                                </Text>
                                <Text style={{ fontSize: 11, color: '#6B7280', marginTop: 2 }} numberOfLines={1}>
                                  {typeof st.distanceKm === 'number' ? `${st.distanceKm.toFixed(2)} km • ` : ''}
                                  {st.address}
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', gap: 6 }}>
                                <View style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignItems: 'center' }}>
                                  <Text style={{ fontSize: 10, color: '#92400E' }}>可借</Text>
                                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#D97706' }}>
                                    {st.availableBikes ?? '--'}
                                  </Text>
                                </View>
                                <View style={{ backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, alignItems: 'center' }}>
                                  <Text style={{ fontSize: 10, color: '#065F46' }}>可還</Text>
                                  <Text style={{ fontSize: 14, fontWeight: '900', color: '#059669' }}>
                                    {st.availableReturnDocks ?? '--'}
                                  </Text>
                                </View>
                              </View>
                            </TouchableOpacity>
                          ))
                        )}
                      </ScrollView>
                    )}
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    {nav.recoverableSession && (
                      <View style={styles.recoverInlineBanner}>
                        <Ionicons name="refresh-circle" size={22} color="#DB2777" />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.recoverTitle}>恢復上次未完成的導航？</Text>
                          <Text style={styles.recoverSub} numberOfLines={1}>
                            前往 {nav.recoverableSession.destination.name}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.recoverBtn}
                          onPress={nav.resumeRecoveredSession}
                        >
                          <Text style={styles.recoverBtnText}>恢復</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={nav.dismissRecoveredSession}
                          style={{ padding: 4 }}
                        >
                          <Ionicons name="close" size={16} color="#9D174D" />
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Apple Maps 風格底部搜尋列＋頭像／設定鈕（收合時僅保留此列） */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => handleOpenSearch()}
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          backgroundColor: isNight ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.06)',
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderRadius: 20,
                        }}
                      >
                        <Ionicons name="search" size={17} color={isNight ? '#CBD5E1' : '#64748B'} />
                        <Text
                          style={{
                            fontSize: 15,
                            fontWeight: '600',
                            color: isNight ? '#CBD5E1' : '#64748B',
                            flex: 1,
                          }}
                          numberOfLines={1}
                        >
                          搜尋 GOBA 地圖
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setSheetCollapsed((c) => !c)}
                        style={{
                          width: 38,
                          height: 38,
                          borderRadius: 19,
                          backgroundColor: isNight ? 'rgba(255,255,255,0.12)' : 'rgba(236,72,153,0.12)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Image
                          source={GOBA_MASCOT}
                          style={{ width: 32, height: 32, borderRadius: 16 }}
                        />
                      </TouchableOpacity>
                    </View>

                    {!sheetCollapsed && (
                      <View style={{ gap: 14, marginTop: 4 }}>
                        {/* GOBA 建議（停車位置或快速探索） */}
                        <View style={{ gap: 6 }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: isNight ? '#F8FAFC' : '#0F172A' }}>
                            GOBA 建議
                          </Text>
                          {savedParking ? (
                            <TouchableOpacity
                              activeOpacity={0.8}
                              onPress={() => {
                                const p: SearchPlace = {
                                  id: `parking-${savedParking.savedAt}`,
                                  name: '我的愛車停車位',
                                  address: `${savedParking.lat.toFixed(5)}, ${savedParking.lon.toFixed(5)}`,
                                  lat: savedParking.lat,
                                  lon: savedParking.lon,
                                  navLat: savedParking.lat,
                                  navLon: savedParking.lon,
                                };
                                nav.setInspectedPlace(p);
                                nav.calculateRoute(p);
                              }}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 10,
                                backgroundColor: isNight ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.05)',
                                paddingHorizontal: 12,
                                paddingVertical: 10,
                                borderRadius: 14,
                              }}
                            >
                              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="car" size={17} color="#FFFFFF" />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: isNight ? '#F8FAFC' : '#0F172A' }}>
                                  停車位置
                                </Text>
                                <Text style={{ fontSize: 11, color: '#64748B' }}>
                                  點擊立即導航回愛車
                                </Text>
                              </View>
                              <Ionicons name="ellipsis-horizontal" size={16} color="#94A3B8" />
                            </TouchableOpacity>
                          ) : (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                              {QUICK_POI_CATEGORIES.slice(0, 4).map((cat) => (
                                <TouchableOpacity
                                  key={cat.label}
                                  activeOpacity={0.8}
                                  onPress={() => handleQuickPoiCategory(cat.label, cat.query, cat.categoryId)}
                                  style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 5,
                                    backgroundColor: isNight ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.05)',
                                    paddingHorizontal: 12,
                                    paddingVertical: 7,
                                    borderRadius: 14,
                                  }}
                                >
                                  <Ionicons name={cat.icon as any} size={13} color="#EC4899" />
                                  <Text style={{ fontSize: 12, fontWeight: '700', color: isNight ? '#E2E8F0' : '#334155' }}>
                                    {cat.label}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </ScrollView>
                          )}
                        </View>

                        {/* 地點（圓形大圖示：住家、公司、加入） */}
                        <View style={{ gap: 8 }}>
                          <Text style={{ fontSize: 13, fontWeight: '800', color: isNight ? '#F8FAFC' : '#0F172A' }}>
                            地點
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 18 }}>
                            <TouchableOpacity
                              style={{ alignItems: 'center', width: 64 }}
                              onPress={() =>
                                nav.commuteAnchors.home
                                  ? nav.calculateRoute(nav.commuteAnchors.home)
                                  : handleOpenSearch('home')
                              }
                            >
                              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#0EA5E9', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="home" size={24} color="#FFFFFF" />
                              </View>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: isNight ? '#F8FAFC' : '#0F172A', marginTop: 5 }}>
                                住家
                              </Text>
                              <Text style={{ fontSize: 10, color: '#64748B' }} numberOfLines={1}>
                                {nav.commuteAnchors.home ? nav.commuteAnchors.home.name : '點擊設定'}
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={{ alignItems: 'center', width: 64 }}
                              onPress={() =>
                                nav.commuteAnchors.work
                                  ? nav.calculateRoute(nav.commuteAnchors.work)
                                  : handleOpenSearch('work')
                              }
                            >
                              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#78350F', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="briefcase" size={22} color="#FFFFFF" />
                              </View>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: isNight ? '#F8FAFC' : '#0F172A', marginTop: 5 }}>
                                公司
                              </Text>
                              <Text style={{ fontSize: 10, color: '#64748B' }} numberOfLines={1}>
                                {nav.commuteAnchors.work ? nav.commuteAnchors.work.name : '點擊設定'}
                              </Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={{ alignItems: 'center', width: 64 }}
                              onPress={() => handleOpenSearch()}
                            >
                              <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: isNight ? 'rgba(255,255,255,0.10)' : 'rgba(148,163,184,0.22)', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="add" size={26} color="#2563EB" />
                              </View>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: isNight ? '#F8FAFC' : '#0F172A', marginTop: 5 }}>
                                加入
                              </Text>
                              <Text style={{ fontSize: 10, color: '#64748B' }}>搜尋地點</Text>
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* 最近搜尋紀錄 */}
                        {nav.recentPlaces.length > 0 && (
                          <View style={{ gap: 6 }}>
                            <Text style={{ fontSize: 13, fontWeight: '800', color: isNight ? '#F8FAFC' : '#0F172A' }}>
                              搜尋紀錄
                            </Text>
                            {nav.recentPlaces.slice(0, 2).map((rp) => (
                              <TouchableOpacity
                                key={rp.id}
                                onPress={() => handleInspectPlaceOnMap(rp)}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 10,
                                  paddingVertical: 4,
                                }}
                              >
                                <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: isNight ? 'rgba(255,255,255,0.1)' : '#E2E8F0', alignItems: 'center', justifyContent: 'center' }}>
                                  <Ionicons name="time-outline" size={15} color="#64748B" />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 13, fontWeight: '700', color: isNight ? '#F8FAFC' : '#0F172A' }} numberOfLines={1}>
                                    {rp.name}
                                  </Text>
                                  <Text style={{ fontSize: 11, color: '#64748B' }} numberOfLines={1}>
                                    {rp.address}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                    )}
                  </View>
                )}
              </>
            )}

            {/* ---------- 狀態 B：Route Preview（路線預覽及車種選擇整合於此，Priority 2.3） ---------- */}
            {uiState === 'route_preview' && (
              <>
                {nav.phase === 'routing' ? (
                  <View style={styles.loadingRow}>
                    <Image source={GOBA_MASCOT} style={styles.mascotLoadingImg} />
                    <View>
                      <Text style={[styles.loadingText, isNight && { color: '#FFFFFF' }]}>
                        鍋巴正在計算{activeProfile.label}最佳路線...
                      </Text>
                      <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
                        Valhalla 台灣道路引擎分析中
                      </Text>
                    </View>
                  </View>
                ) : nav.route ? (
                  <>
                    {/* 車種切換列（僅在 Route Preview 顯示，不污染一般瀏覽地圖） */}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.previewVehicleRow}
                    >
                      {DISPLAY_VEHICLE_PROFILES.map((v) => {
                        const active = nav.vehicleType === v.id;
                        return (
                          <TouchableOpacity
                            key={v.id}
                            activeOpacity={0.85}
                            onPress={() => nav.setVehicleType(v.id)}
                          >
                            {active ? (
                              <LinearGradient
                                colors={[v.routeColor, v.routeCasingColor]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.vehiclePillActive}
                              >
                                <Ionicons name={v.iconName as any} size={14} color="#FFFFFF" />
                                <Text style={styles.vehiclePillTextActive}>{v.shortLabel}</Text>
                              </LinearGradient>
                            ) : (
                              <View
                                style={[
                                  styles.previewVehicleInactive,
                                  isNight && { backgroundColor: 'rgba(255,255,255,0.08)' },
                                ]}
                              >
                                <Ionicons
                                  name={v.iconName as any}
                                  size={14}
                                  color={isNight ? '#CBD5E1' : '#374151'}
                                />
                                <Text
                                  style={[
                                    styles.vehiclePillText,
                                    isNight && { color: '#E2E8F0' },
                                  ]}
                                >
                                  {v.shortLabel}
                                </Text>
                              </View>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>

                    {/* 多路線方案選擇列（主路線 + Valhalla 備選路線） */}
                    {nav.primaryRoute &&
                      Array.isArray(nav.primaryRoute.alternatives) &&
                      nav.primaryRoute.alternatives.length > 0 && (
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
                        >
                          {[
                            {
                              idx: 0,
                              label: '推薦路線',
                              durationSec: nav.primaryRoute.durationSec,
                              distanceKm: nav.primaryRoute.distanceKm,
                            },
                            ...nav.primaryRoute.alternatives.map((alt, aIdx) => ({
                              idx: aIdx + 1,
                              label: alt.label || `備選 ${aIdx + 1}`,
                              durationSec: alt.durationSec,
                              distanceKm: alt.distanceKm,
                            })),
                          ].map((opt) => {
                            const selected = nav.selectedAltIndex === opt.idx;
                            const accentColor = isPinkTheme ? '#EC4899' : '#16A34A';
                            return (
                              <TouchableOpacity
                                key={`route-opt-${opt.idx}`}
                                activeOpacity={0.85}
                                onPress={() => nav.selectAlternativeRoute(opt.idx)}
                                style={{
                                  paddingHorizontal: 12,
                                  paddingVertical: 7,
                                  borderRadius: 12,
                                  borderWidth: 1.5,
                                  borderColor: selected
                                    ? accentColor
                                    : isNight
                                    ? 'rgba(255,255,255,0.14)'
                                    : '#E2E8F0',
                                  backgroundColor: selected
                                    ? isPinkTheme
                                      ? 'rgba(236,72,153,0.14)'
                                      : 'rgba(22,163,74,0.12)'
                                    : isNight
                                    ? 'rgba(255,255,255,0.05)'
                                    : '#F8FAFC',
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 12,
                                    fontWeight: '800',
                                    color: selected
                                      ? accentColor
                                      : isNight
                                      ? '#E2E8F0'
                                      : '#334155',
                                  }}
                                >
                                  {opt.label} · {formatDurationZh(opt.durationSec)}
                                </Text>
                                <Text
                                  style={{
                                    fontSize: 11,
                                    color: isNight ? '#94A3B8' : '#64748B',
                                    marginTop: 1,
                                  }}
                                >
                                  {opt.distanceKm.toFixed(1)} 公里
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      )}

                    <View style={styles.routeHeader}>
                      <View style={{ flex: 1 }}>
                        <View style={styles.etaRow}>
                          <Text
                            style={[styles.etaDuration, isNight && { color: '#FFFFFF' }]}
                            maxFontSizeMultiplier={1.2}
                          >
                            {formatDurationZh(remainingSec)}
                          </Text>
                          <Text style={styles.etaDot}>•</Text>
                          <Text
                            style={[styles.etaDistance, isNight && { color: '#CBD5E1' }]}
                            maxFontSizeMultiplier={1.2}
                          >
                            {remainingDistKm.toFixed(1)} 公里
                          </Text>
                        </View>
                        <Text style={styles.etaSub} numberOfLines={1}>
                          預計 {formatEtaTime(remainingSec)} 抵達 •{' '}
                          {typeof nav.route?.trafficSignalCount === 'number' &&
                          nav.route.trafficSignalCount > 0
                            ? `剩餘 ${
                                nav.progress?.remainingTrafficSignalCount ??
                                nav.route.trafficSignalCount
                              } 個紅綠燈 • `
                            : ''}
                          {nav.destination?.name || '目的地'}
                        </Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {nav.destination && (
                          <TouchableOpacity
                            style={styles.closeSheetBtn}
                            onPress={() =>
                              nav.destination && nav.handleToggleFavorite(nav.destination)
                            }
                          >
                            <Ionicons
                              name={isPlaceFavorite(nav.destination) ? 'star' : 'star-outline'}
                              size={17}
                              color={isPlaceFavorite(nav.destination) ? '#EC4899' : '#6B7280'}
                            />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    {!sheetCollapsed && (
                      <>
                        {nav.route.warning && (
                          <View style={styles.warningStrip}>
                            <Ionicons name="shield-checkmark-outline" size={15} color="#92400E" />
                            <Text style={styles.warningStripText} maxFontSizeMultiplier={1.2}>
                              {nav.route.warning}
                            </Text>
                          </View>
                        )}

                        {(nav.vehicleType === 'car' || nav.vehicleType === 'heavy_moto') && (
                          <View style={styles.optionRow}>
                            {nav.vehicleType === 'car' && (
                              <TouchableOpacity
                                style={[styles.optChip, nav.avoidTolls && styles.optChipActive]}
                                onPress={() => handleToggleAvoidOption('tolls')}
                              >
                                <Text
                                  style={[
                                    styles.optChipText,
                                    nav.avoidTolls && styles.optChipTextActive,
                                  ]}
                                >
                                  避開收費站
                                </Text>
                              </TouchableOpacity>
                            )}
                            <TouchableOpacity
                              style={[styles.optChip, nav.avoidHighways && styles.optChipActive]}
                              onPress={() => handleToggleAvoidOption('highways')}
                            >
                              <Text
                                style={[
                                  styles.optChipText,
                                  nav.avoidHighways && styles.optChipTextActive,
                                ]}
                              >
                                {nav.vehicleType === 'heavy_moto'
                                  ? '避開快速道路'
                                  : '避開高速公路'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {nav.route.transitPending ? (
                          <View style={styles.actionRow}>
                            <TouchableOpacity
                              style={styles.secondaryBtn}
                              onPress={() => setShowManeuvers((v) => !v)}
                            >
                              <Ionicons name="walk" size={16} color="#1F2937" />
                              <Text style={styles.secondaryBtnText}>步行參考</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={{ flex: 1.4 }}
                              activeOpacity={0.9}
                              onPress={() => {
                                if (nav.destination) {
                                  const url = `maps://?daddr=${nav.destination.lat},${nav.destination.lon}&dirflg=r`;
                                  Linking.openURL(url).catch(() => {});
                                }
                              }}
                            >
                              <LinearGradient
                                colors={['#8B5CF6', '#6D28D9']}
                                style={styles.primaryGradBtn}
                              >
                                <Ionicons name="train" size={16} color="#FFFFFF" />
                                <Text style={styles.primaryBtnText}>查捷運／公車班次</Text>
                              </LinearGradient>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={styles.actionRow}>
                            <TouchableOpacity
                              style={styles.iconActionBtn}
                              onPress={() => setShowManeuvers((v) => !v)}
                            >
                              <Ionicons name="list" size={18} color="#1F2937" />
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={styles.secondaryBtn}
                              onPress={nav.startSimulatedNavigation}
                            >
                              <Ionicons name="play" size={15} color="#1F2937" />
                              <Text style={styles.secondaryBtnText}>模擬導航</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              style={{ flex: 1.45 }}
                              activeOpacity={0.9}
                              onPress={handleStartNavigationPress}
                            >
                              <LinearGradient
                                colors={[
                                  activeProfile.routeColor,
                                  activeProfile.routeCasingColor,
                                ]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.primaryGradBtn}
                              >
                                <Ionicons name="navigate" size={16} color="#FFFFFF" />
                                <Text style={styles.primaryBtnText}>開始導航</Text>
                              </LinearGradient>
                            </TouchableOpacity>
                          </View>
                        )}

                        {showManeuvers && (
                          <ScrollView style={styles.maneuverList} nestedScrollEnabled>
                            {nav.route.maneuvers.map((m) => (
                              <TouchableOpacity
                                key={m.index}
                                style={styles.maneuverRow}
                                onPress={() => {
                                  if (m.coordinate) {
                                    nav.setFollowMode('free');
                                    cameraRef.current?.easeTo({
                                      center: m.coordinate,
                                      zoom: 16.5,
                                      duration: 500,
                                    });
                                  }
                                }}
                              >
                                <View style={styles.maneuverIconCircle}>
                                  <ManeuverArrowIcon
                                    type={m.type}
                                    size={18}
                                    color="#831843"
                                  />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text
                                    style={[
                                      styles.maneuverTitle,
                                      isNight && { color: '#F8FAFC' },
                                    ]}
                                  >
                                    {m.instruction}
                                  </Text>
                                  <Text style={styles.maneuverMeta}>
                                    {m.distanceKm > 0
                                      ? `${m.distanceKm.toFixed(2)} km`
                                      : '路口節點'}
                                    {m.durationSec > 0
                                      ? ` • 約 ${Math.max(1, Math.round(m.durationSec / 60))} 分`
                                      : ''}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        )}
                      </>
                    )}
                  </>
                ) : null}
              </>
            )}

            {/* ---------- 狀態 C：Navigation（正式導航底卡與抵達吉祥物畫面） ---------- */}
            {uiState === 'navigation' && (
              <>
                {nav.phase === 'arrived' ? (
                  <View style={styles.arrivedWrap}>
                    <View style={styles.arrivedBadge}>
                      <Image source={GOBA_MASCOT} style={styles.mascotArrivedImg} />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[styles.arrivedTitle, isNight && { color: '#34D399' }]}
                          maxFontSizeMultiplier={1.2}
                        >
                          鍋巴陪你平安抵達！
                        </Text>
                        <Text style={styles.arrivedSub} numberOfLines={1}>
                          {nav.destination?.name || '目的地'}
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity activeOpacity={0.9} onPress={nav.clearRoute}>
                      <LinearGradient
                        colors={['#EC4899', '#DB2777']}
                        style={styles.primaryGradBtn}
                      >
                        <Text style={styles.primaryBtnText}>完成導航</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                  <View
                    style={{
                      backgroundColor: isNight
                        ? 'rgba(15, 23, 42, 0.94)'
                        : 'rgba(255, 255, 255, 0.95)',
                      borderRadius: 22,
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      borderWidth: 1,
                      borderColor: isNight
                        ? 'rgba(255, 255, 255, 0.14)'
                        : 'rgba(15, 23, 42, 0.08)',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      {/* 左側：高德風格 × 結束導航按鈕 */}
                      <TouchableOpacity
                        onPress={nav.stopNavigation}
                        activeOpacity={0.8}
                        accessibilityLabel="結束導航"
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: isNight
                            ? 'rgba(239, 68, 68, 0.2)'
                            : 'rgba(239, 68, 68, 0.12)',
                          borderWidth: 1,
                          borderColor: isNight
                            ? 'rgba(239, 68, 68, 0.45)'
                            : 'rgba(239, 68, 68, 0.30)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name="close" size={22} color={isNight ? '#FCA5A5' : '#DC2626'} />
                      </TouchableOpacity>

                      {/* 中央：剩餘時間 / 剩餘距離 / 紅綠燈數 / 預計抵達時間 */}
                      <TouchableOpacity
                        style={{ flex: 1, alignItems: 'center' }}
                        activeOpacity={0.8}
                        onPress={() => setShowManeuvers((v) => !v)}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 17, fontWeight: '900', color: isNight ? '#FFFFFF' : '#0F172A' }}>
                            {formatDurationZh(remainingSec)}
                          </Text>
                          <Text style={{ fontSize: 13, color: isNight ? '#64748B' : '#94A3B8' }}>•</Text>
                          <Text style={{ fontSize: 16, fontWeight: '800', color: isNight ? '#E2E8F0' : '#1E293B' }}>
                            {remainingDistKm.toFixed(1)} 公里
                          </Text>
                          {(nav.progress?.remainingTrafficSignalCount ??
                            nav.route?.trafficSignalCount ??
                            0) > 0 && (
                            <View
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 3,
                                backgroundColor: isNight
                                  ? 'rgba(255,255,255,0.1)'
                                  : 'rgba(15, 23, 42, 0.06)',
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 8,
                              }}
                            >
                              <View
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: 3,
                                  backgroundColor: '#22C55E',
                                }}
                              />
                              <Text style={{ fontSize: 12, fontWeight: '800', color: isNight ? '#FDE68A' : '#15803D' }}>
                                {nav.progress?.remainingTrafficSignalCount ??
                                  nav.route?.trafficSignalCount}
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 12, color: isNight ? '#94A3B8' : '#64748B', marginTop: 2 }}>
                          {formatEtaTime(remainingSec)} 到達 • {nav.destination?.name || '目的地'}
                        </Text>
                      </TouchableOpacity>

                      {/* 右側：路線總覽 / 暫停切換 */}
                      <TouchableOpacity
                        onPress={handleOverviewRoute}
                        activeOpacity={0.8}
                        accessibilityLabel="路線總覽"
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: isNight
                            ? 'rgba(255, 255, 255, 0.1)'
                            : 'rgba(236, 72, 153, 0.10)',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Ionicons name="map-outline" size={19} color={isNight ? '#F9A8D4' : '#DB2777'} />
                      </TouchableOpacity>
                    </View>
                  </View>

                    {!sheetCollapsed && showManeuvers && nav.route && (
                      <ScrollView style={styles.maneuverList} nestedScrollEnabled>
                        {nav.route.maneuvers.map((m) => {
                          const isCurrentStep = nav.progress?.activeManeuverIndex === m.index;
                          return (
                            <TouchableOpacity
                              key={m.index}
                              style={[
                                styles.maneuverRow,
                                isCurrentStep && styles.maneuverRowActive,
                              ]}
                              onPress={() => {
                                if (m.coordinate) {
                                  nav.setFollowMode('free');
                                  cameraRef.current?.easeTo({
                                    center: m.coordinate,
                                    zoom: 16.5,
                                    duration: 500,
                                  });
                                }
                              }}
                            >
                              <View
                                style={[
                                  styles.maneuverIconCircle,
                                  isCurrentStep && { backgroundColor: activeProfile.routeColor },
                                ]}
                              >
                                <ManeuverArrowIcon
                                  type={m.type}
                                  size={18}
                                  color={isCurrentStep ? '#FFFFFF' : '#831843'}
                                />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text
                                  style={[
                                    styles.maneuverTitle,
                                    isNight && { color: '#F8FAFC' },
                                    isCurrentStep && { color: '#EC4899', fontWeight: '800' },
                                  ]}
                                >
                                  {m.instruction}
                                </Text>
                                <Text style={styles.maneuverMeta}>
                                  {m.distanceKm > 0
                                    ? `${m.distanceKm.toFixed(2)} km`
                                    : '路口節點'}
                                </Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  </>
                )}
              </>
            )}
          </LiquidGlassSurface>
        </View>
      )}

      {/* ==================== 回報地點錯誤 Modal（Section 九：支援搬遷、地址錯誤、停業、名稱錯誤、重複、缺少地點） ==================== */}
      <Modal
        visible={feedbackModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setFeedbackModalVisible(false)}
      >
        <View style={styles.feedbackModalBackdrop}>
          <LiquidGlassSurface
            variant={isNight ? 'dark' : 'light'}
            borderRadius={26}
            style={{ width: '92%', maxWidth: 420 }}
            contentStyle={{ padding: 20, gap: 12 }}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={[styles.settingsTitle, isNight && { color: '#FFFFFF' }]}>
                回報地點錯誤或商家搬遷
              </Text>
              <TouchableOpacity onPress={() => setFeedbackModalVisible(false)}>
                <Ionicons name="close-circle" size={24} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 12, color: '#6B7280' }}>
              提交後將送入核實佇列，經查證無誤後會立即更新正式 POI 並攔截舊址。
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {[
                { key: 'relocated', label: '店家搬遷' },
                { key: 'address_wrong', label: '地址錯誤' },
                { key: 'name_wrong', label: '名稱錯誤' },
                { key: 'closed', label: '店家停業' },
                { key: 'duplicate', label: '重複地點' },
                { key: 'missing_place', label: '缺少地點' },
                { key: 'other', label: '缺少車道／標線或其他' },
              ].map((it) => {
                const active = feedbackIssueType === it.key;
                return (
                  <TouchableOpacity
                    key={it.key}
                    style={[styles.optChip, active && { backgroundColor: '#DB2777' }]}
                    onPress={() => setFeedbackIssueType(it.key as any)}
                  >
                    <Text style={[styles.optChipText, active && { color: '#FFFFFF' }]}>
                      {it.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TextInput
              style={styles.feedbackInput}
              placeholder="正確商家名稱（如：日威車業）"
              placeholderTextColor="#9CA3AF"
              value={feedbackName}
              onChangeText={setFeedbackName}
            />
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <TextInput
                style={[styles.feedbackInput, { flex: 1 }]}
                placeholder="正確完整地址（如：桃園市龜山區文化三路462號）"
                placeholderTextColor="#9CA3AF"
                value={feedbackAddress}
                onChangeText={(txt) => {
                  setFeedbackAddress(txt);
                  if (!feedbackManualPin) {
                    setFeedbackLat(null);
                    setFeedbackLon(null);
                  }
                }}
              />
              <TouchableOpacity
                style={[
                  styles.optChip,
                  { backgroundColor: '#DB2777', height: 42, justifyContent: 'center' },
                ]}
                disabled={feedbackGeocoding}
                onPress={() => handleGeocodeFeedbackAddress()}
              >
                {feedbackGeocoding ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
                    📍 定位
                  </Text>
                )}
              </TouchableOpacity>
            </View>

            {/* Section 六：新增／修改地點前顯示互動式地圖預覽，支援點擊預覽圖手動微調標記，絕不沿用上一個商家座標 */}
            <View
              style={{
                height: 138,
                borderRadius: 14,
                overflow: 'hidden',
                borderWidth: 1,
                borderColor: feedbackLat !== null ? '#10B981' : '#F59E0B',
                backgroundColor: '#E5E7EB',
              }}
            >
              <Map
                style={{ flex: 1 }}
                mapStyle={effectiveStyleUrl}
                onPress={(e: any) => {
                  const ll = e?.nativeEvent?.lngLat;
                  if (Array.isArray(ll) && ll.length >= 2) {
                    setFeedbackLon(Number(Number(ll[0]).toFixed(6)));
                    setFeedbackLat(Number(Number(ll[1]).toFixed(6)));
                    setFeedbackManualPin(true);
                  }
                }}
              >
                <Camera
                  center={[
                    feedbackLon ?? nav.effectiveOrigin.lon,
                    feedbackLat ?? nav.effectiveOrigin.lat,
                  ]}
                  zoom={feedbackLat !== null ? 16.5 : 13.5}
                  duration={350}
                />
                {feedbackLat !== null && feedbackLon !== null && (
                  <Marker
                    id="goba-feedback-preview-pin"
                    lngLat={[feedbackLon, feedbackLat]}
                    anchor="bottom"
                  >
                    <View style={styles.destMarkerWrap}>
                      <LinearGradient
                        colors={['#10B981', '#059669']}
                        style={styles.destMarkerBadge}
                      >
                        <Ionicons name="pin" size={14} color="#FFFFFF" />
                      </LinearGradient>
                      <View style={[styles.destMarkerTip, { borderTopColor: '#059669' }]} />
                    </View>
                  </Marker>
                )}
              </Map>
              <View
                style={{
                  position: 'absolute',
                  bottom: 6,
                  left: 8,
                  right: 8,
                  backgroundColor: 'rgba(15,23,42,0.78)',
                  borderRadius: 8,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                }}
              >
                <Text style={{ fontSize: 10, color: '#FFFFFF', fontWeight: '600' }} numberOfLines={1}>
                  {feedbackLat !== null && feedbackLon !== null
                    ? `${feedbackManualPin ? '✓ 已手動標記' : '✓ 門牌解析座標'}：${feedbackLat.toFixed(
                        5
                      )}, ${feedbackLon.toFixed(5)}（點擊地圖可微調）`
                    : '⚠️ 請按「📍 定位」解析門牌，或直接點擊此地圖標記正確位置'}
                </Text>
              </View>
            </View>

            {feedbackGeoCandidates.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {feedbackGeoCandidates.slice(0, 3).map((gc, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.optChip}
                    onPress={() => {
                      setFeedbackLat(gc.lat);
                      setFeedbackLon(gc.lon);
                      setFeedbackManualPin(false);
                    }}
                  >
                    <Text style={styles.optChipText} numberOfLines={1}>
                      候選 {idx + 1}：{gc.address.slice(0, 16)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.feedbackInput, { flex: 1 }]}
                placeholder="電話（選填）"
                placeholderTextColor="#9CA3AF"
                value={feedbackPhone}
                onChangeText={setFeedbackPhone}
              />
            </View>
            <View style={{ marginTop: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#374151', marginBottom: 4 }}>
                營業時間設定（三種模式 + 每週預覽）
              </Text>
              <OpeningHoursPicker value={feedbackHours} onChange={setFeedbackHours} />
            </View>
            <TextInput
              style={styles.feedbackInput}
              placeholder="補充說明（如：已由中山路舊址搬遷至此）"
              placeholderTextColor="#9CA3AF"
              value={feedbackNote}
              onChangeText={setFeedbackNote}
            />

            <TouchableOpacity
              activeOpacity={0.9}
              disabled={feedbackSubmitting}
              onPress={handleSubmitFeedback}
            >
              <LinearGradient colors={['#F472B6', '#DB2777']} style={styles.primaryGradBtn}>
                {feedbackSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="paper-plane" size={15} color="#FFFFFF" />
                    <Text style={styles.primaryBtnText}>送出修正回報（待核實）</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </LiquidGlassSurface>
        </View>
      </Modal>

      <FleetModal
        visible={fleetModalOpen}
        isNight={isNight}
        onClose={() => setFleetModalOpen(false)}
        memberId={fleetState.memberId}
        nickname={fleetState.nickname}
        setNickname={fleetState.setNickname}
        fleet={fleetState.fleet}
        savedRooms={fleetState.savedRooms}
        isLeader={fleetState.isLeader}
        shareLocation={fleetState.shareLocation}
        setShareLocation={fleetState.setShareLocation}
        isRecordingPtt={fleetState.isRecordingPtt}
        openMicMuted={fleetState.openMicMuted}
        onToggleOpenMicMute={() => fleetState.setOpenMicMuted((m) => !m)}
        busy={fleetState.busy}
        error={fleetState.error}
        currentDestination={
          nav.destination
            ? {
                name: nav.destination.name,
                address: nav.destination.address,
                lat: nav.destination.navLat ?? nav.destination.lat,
                lon: nav.destination.navLon ?? nav.destination.lon,
              }
            : null
        }
        onCreateFleet={(nick) =>
          fleetState.createFleet(
            nick,
            nav.destination
              ? {
                  name: nav.destination.name,
                  address: nav.destination.address,
                  lat: nav.destination.navLat ?? nav.destination.lat,
                  lon: nav.destination.navLon ?? nav.destination.lon,
                }
              : null
          )
        }
        onJoinFleet={(code, nick) => fleetState.joinFleet(code, nick)}
        onDisconnectFleet={() => fleetState.disconnectFleet()}
        onLeaveFleet={() => fleetState.leaveFleet()}
        onStartPtt={() => fleetState.startPttRecording()}
        onStopPtt={() => fleetState.stopAndSendPtt()}
        onChangeVoiceMode={(mode) => fleetState.updateRallyOrDest({ voiceMode: mode })}
        onSendAlert={(txt) => fleetState.sendTextAlert(txt)}
        onSyncCurrentDestToFleet={() => {
          if (nav.destination) {
            fleetState.updateRallyOrDest({
              dest: {
                name: nav.destination.name,
                address: nav.destination.address,
                lat: nav.destination.navLat ?? nav.destination.lat,
                lon: nav.destination.navLon ?? nav.destination.lon,
              },
            });
          }
        }}
        onNavigateToFleetDest={(dest) => {
          const place: SearchPlace = {
            id: `fleet-dest-${dest.lat.toFixed(4)}-${dest.lon.toFixed(4)}`,
            name: dest.name,
            address: dest.address || '車隊共同目的地',
            lat: dest.lat,
            lon: dest.lon,
            navLat: dest.lat,
            navLon: dest.lon,
          };
          nav.setInspectedPlace(place);
          nav.calculateRoute(place);
        }}
      />
      <ExtrasModal
        visible={extrasModalOpen}
        isNight={isNight}
        onClose={() => setExtrasModalOpen(false)}
        cursorSkin={cursorSkin}
        onSelectCursorSkin={(skin) => {
          setCursorSkin(skin);
          void saveNavCursorSkin(skin);
        }}
        savedParking={savedParking}
        onSaveParkingNow={() => {
          const coord = nav.gps ?? nav.effectiveOrigin;
          const spot: SavedParkingSpot = {
            lat: coord.lat,
            lon: coord.lon,
            note: '愛車停放位置',
            savedAt: Date.now(),
          };
          setSavedParking(spot);
          void saveParkingSpot(spot);
        }}
        onNavigateToParking={(spot) => {
          const p: SearchPlace = {
            id: `parking-${spot.savedAt}`,
            name: '我的愛車停車位',
            address: `${spot.lat.toFixed(5)}, ${spot.lon.toFixed(5)}`,
            lat: spot.lat,
            lon: spot.lon,
            navLat: spot.lat,
            navLon: spot.lon,
          };
          nav.setInspectedPlace(p);
          nav.calculateRoute(p);
        }}
        onClearParking={() => {
          setSavedParking(null);
          void clearParkingSpot();
        }}
        tripHistory={tripHistory}
        onSubmitReport={async (cat: CommunityCategory) => {
          const coord = nav.gps ?? nav.effectiveOrigin;
          const ok = await submitCommunityReport({
            category: cat,
            lat: coord.lat,
            lon: coord.lon,
            roadName: nav.progress?.nextManeuver?.streetNames?.[0] || '目前路段',
          });
          if (ok) {
            fetchCommunityReports(coord.lat, coord.lon).then(setCommunityReports);
          }
        }}
        onRunVoiceCommand={async (txt) => {
          const parsed = parseGobaVoiceCommand(txt);
          if (parsed.type === 'save_parking') {
            const coord = nav.gps ?? nav.effectiveOrigin;
            const spot: SavedParkingSpot = {
              lat: coord.lat,
              lon: coord.lon,
              note: '語音記錄車位',
              savedAt: Date.now(),
            };
            setSavedParking(spot);
            void saveParkingSpot(spot);
          } else if (parsed.type === 'fleet_alert') {
            await fleetState.sendTextAlert(parsed.text);
          } else if (parsed.type === 'nearby') {
            setIsSearchOpen(true);
            handleQueryChange(parsed.category);
          } else {
            setIsSearchOpen(true);
            handleQueryChange(parsed.query);
          }
        }}
        activeShareUrl={tripShareUrl}
        onToggleTripShare={async () => {
          if (tripShareToken) {
            await revokeTripShare(tripShareToken);
            setTripShareToken(null);
            setTripShareUrl(null);
            return;
          }
          const dest = nav.destination;
          const coord = nav.gps ?? nav.effectiveOrigin;
          const created = await createTripShare({
            nickname: fleetState.nickname || '鍋巴車友',
            destName: dest?.name || '目的地',
            destLat: dest?.lat ?? coord.lat,
            destLon: dest?.lon ?? coord.lon,
            lat: coord.lat,
            lon: coord.lon,
            etaSec: Math.round(nav.progress?.remainingDurationSec ?? nav.route?.durationSec ?? 0),
            remainingKm: Number(((nav.progress ? nav.progress.remainingDistanceMeters / 1000 : nav.route?.distanceKm) ?? 0).toFixed(2)),
          });
          if (created) {
            setTripShareToken(created.token);
            setTripShareUrl(created.shareUrl);
            Share.share({
              message: `我正在使用 GOBA Maps 前往「${dest?.name || '目的地'}」，點此查看即時位置與 ETA：\n${created.shareUrl}`,
            }).catch(() => {});
          }
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F6F4' },
  map: { flex: 1 },
  topOverlay: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 32 : 8,
    left: 14,
    right: 14,
    gap: 10,
  },
  // 浮動搜尋膠囊
  searchCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    paddingHorizontal: 8,
    gap: 6,
  },
  capsuleBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchTriggerArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: '100%',
  },
  searchPlaceholderText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
    paddingVertical: 0,
  },
  capsuleClearBtn: { padding: 6 },
  // Route Preview 頂部摘要列
  previewTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    gap: 8,
  },
  previewOriginLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
  },
  previewDestTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  chipScrollRow: {
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  previewVehicleRow: {
    gap: 8,
    paddingBottom: 12,
  },
  vehiclePillActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    shadowColor: '#831843',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 4,
  },
  vehiclePillTextActive: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  previewVehicleInactive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  vehiclePillText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
  },
  poiGlassChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  poiGlassText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  // 全螢幕 Search 專頁
  searchSheetOverlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
  },
  searchSheetSafe: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 36 : 8,
  },
  searchModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  searchModalInputBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  cancelSearchBtn: {
    paddingHorizontal: 6,
    paddingVertical: 8,
  },
  cancelSearchText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#EC4899',
  },
  searchSheetScroll: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 18,
  },
  commuteRow: {
    flexDirection: 'row',
    gap: 10,
  },
  commuteCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  commuteIconBox: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FDF2F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commuteTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#111827',
  },
  commuteSub: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  searchSection: {
    gap: 2,
  },
  searchSectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9CA3AF',
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  searchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 8,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.07)',
  },
  searchItemIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(236, 72, 153, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchItemTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  searchItemAddr: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  searchDistText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EC4899',
    fontVariant: ['tabular-nums'],
  },
  mascotEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
    paddingHorizontal: 24,
    gap: 8,
  },
  mascotImg: {
    width: 72,
    height: 72,
    borderRadius: 22,
    marginBottom: 4,
  },
  mascotLoadingImg: {
    width: 44,
    height: 44,
    borderRadius: 14,
  },
  mascotArrivedImg: {
    width: 52,
    height: 52,
    borderRadius: 16,
  },
  mascotEmptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  mascotEmptyDesc: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 19,
  },
  bannerError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerErrorText: { flex: 1, fontSize: 12, color: '#B91C1C', fontWeight: '600' },
  openSettingsBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  openSettingsBtnText: { fontSize: 11, fontWeight: '700', color: '#B91C1C' },
  // 導航 Turn-by-Turn HUD
  navHudMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
  },
  navHudArrowBox: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navHudDistance: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  navHudInstruction: {
    fontSize: 15,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.94)',
    marginTop: 2,
  },
  thenStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.24)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  thenLabel: { fontSize: 12, fontWeight: '700', color: '#F9A8D4' },
  thenText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#FFFFFF' },
  rerouteStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(180, 83, 9, 0.88)',
  },
  rerouteStripText: { fontSize: 12, fontWeight: '700', color: '#FEF3C7' },
  hudMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  hudTagInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  hudTagText: { fontSize: 11, fontWeight: '700', color: '#FFFFFF' },
  // 右側控制島
  rightDockWrap: {
    position: 'absolute',
    right: 14,
    top: '34%',
    gap: 12,
  },
  dockBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dockDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 10,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  dock3DText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1F2937',
  },
  settingsOverlay: {
    position: 'absolute',
    left: 16,
    right: 70,
    top: '28%',
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingsTitle: { fontSize: 15, fontWeight: '800', color: '#111827' },
  diagTitle: { fontSize: 11, fontWeight: '700', color: '#6B7280', marginTop: 2 },
  diagRowText: { fontSize: 11, color: '#374151', marginBottom: 2 },
  // 左下角車速球
  speedWrap: {
    position: 'absolute',
    left: 16,
    bottom: Platform.OS === 'ios' ? 200 : 185,
  },
  speedInner: {
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speedValue: {
    fontSize: 21,
    fontWeight: '800',
    color: '#FFFFFF',
    lineHeight: 23,
    fontVariant: ['tabular-nums'],
  },
  speedUnit: {
    fontSize: 10,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.72)',
  },
  recenterWrap: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: Platform.OS === 'ios' ? 205 : 190,
  },
  recenterInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  recenterText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // 下一個轉彎路口高亮標記
  nextTurnNodeOuter: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(236, 72, 153, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextTurnNodeInner: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 2.5,
    borderColor: '#DB2777',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehiclePuckHalo: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(236, 72, 153, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehiclePuckCore: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 3.5,
    borderColor: '#EC4899',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 6,
  },
  poiPinWrap: { alignItems: 'center', maxWidth: 115 },
  poiPinBubble: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#DB2777',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  poiPinLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    color: '#111827',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    overflow: 'hidden',
  },
  destMarkerWrap: { alignItems: 'center' },
  destMarkerBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  destMarkerTip: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#DB2777',
    marginTop: -2,
  },
  // 底部可收合動態資訊卡
  bottomSheetOuter: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: Platform.OS === 'ios' ? 24 : 14,
  },
  bottomSheetInner: {
    paddingHorizontal: 18,
    paddingTop: 6,
    paddingBottom: 18,
  },
  grabHandleHitBox: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  grabHandle: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.16)',
  },
  browseHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  placeCatBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: '#FCE7F3',
  },
  placeCatBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#9D174D',
  },
  placeDistLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EC4899',
  },
  placeDetailTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#111827',
    marginTop: 4,
  },
  placeDetailAddr: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
    lineHeight: 18,
  },
  coordMicroText: {
    marginLeft: 'auto',
    fontSize: 11,
    color: '#9CA3AF',
    fontVariant: ['tabular-nums'],
  },
  recoverInlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 14,
    backgroundColor: '#FDF2F8',
  },
  recoverTitle: { fontSize: 12, fontWeight: '800', color: '#831843' },
  recoverSub: { fontSize: 11, color: '#9D174D' },
  recoverBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#DB2777',
  },
  recoverBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  loadingText: { fontSize: 14, fontWeight: '800', color: '#1F2937' },
  arrivedWrap: { gap: 14 },
  arrivedBadge: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  arrivedTitle: { fontSize: 18, fontWeight: '800', color: '#065F46' },
  arrivedSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  etaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  etaDuration: {
    fontSize: 25,
    fontWeight: '800',
    color: '#111827',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  etaDot: { fontSize: 16, color: '#9CA3AF' },
  etaDistance: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4B5563',
    fontVariant: ['tabular-nums'],
  },
  etaSub: { fontSize: 13, color: '#6B7280', marginTop: 2, fontWeight: '500' },
  closeSheetBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 10,
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(254, 243, 199, 0.88)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F59E0B',
  },
  warningStripText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: '#92400E',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  optChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
  optChipActive: { backgroundColor: '#1F2937' },
  optChipText: { fontSize: 12, fontWeight: '600', color: '#374151' },
  optChipTextActive: { color: '#FFFFFF' },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  iconActionBtn: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '700', color: '#1F2937' },
  primaryGradBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 46,
    borderRadius: 16,
    shadowColor: '#DB2777',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 5,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  maneuverList: {
    maxHeight: 200,
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    paddingTop: 8,
  },
  maneuverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  maneuverRowActive: {
    backgroundColor: 'rgba(219, 39, 119, 0.12)',
  },
  maneuverIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(219, 39, 119, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  maneuverTitle: { fontSize: 13, fontWeight: '600', color: '#111827' },
  maneuverMeta: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  idleTitle: { fontSize: 16, fontWeight: '800', color: '#111827', letterSpacing: -0.2 },
  idleDesc: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  verifiedMicroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#D1FAE5',
  },
  verifiedMicroText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
  },
  closedMicroBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  closedMicroText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B91C1C',
  },
  brandTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9D174D',
    backgroundColor: '#FCE7F3',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
    overflow: 'hidden',
  },
  metaMicroText: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '500',
  },
  relocMicroText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
    marginTop: 1,
  },
  inlineRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: '#EC4899',
  },
  inlineRouteBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  serviceMicroPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(236, 72, 153, 0.1)',
  },
  serviceMicroText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#831843',
  },
  feedbackModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedbackInput: {
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.05)',
    fontSize: 13,
    color: '#111827',
  },
  trafficSignalHousing: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2.5,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 9,
    backgroundColor: '#1E293B',
    borderWidth: 1.2,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
  trafficSignalHousingOnRoute: {
    backgroundColor: '#0F172A',
    borderColor: '#F472B6',
    borderWidth: 1.6,
    transform: [{ scale: 1.08 }],
  },
  trafficSignalHousingNext: {
    backgroundColor: '#0F172A',
    borderColor: '#FBBF24',
    borderWidth: 2,
    transform: [{ scale: 1.22 }],
    shadowColor: '#F59E0B',
    shadowOpacity: 0.55,
    shadowRadius: 5,
  },
  trafficSignalDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  trafficSignalHousingCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1.5,
    paddingHorizontal: 3.5,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.85)',
  },
  trafficSignalDotCompact: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
  hudTrafficLightPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.65)',
  },
  hudTrafficLightPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FDE68A',
  },
  hudMiniTrafficLight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#0F172A',
  },
  trafficSignalDotMini: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
