import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  Linking,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
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
import { recordNavDiagnostic } from '../navigation/diagnostics';
import {
  type ReplayScenarioResult,
  runAllGpsReplayScenarios,
} from '../navigation/gpsReplayTester';
import { getEffectiveMapStyleUrl, MAP_STYLE_OPTIONS } from '../navigation/mapStyle';
import { formatDistanceMetersZh, splitRouteCoords } from '../navigation/navEngine';
import { Coordinate, SearchPlace, TrafficSignalNode } from '../navigation/types';
import { useNavigationState } from '../navigation/useNavigationState';
import {
  fetchAdminFeedbackQueue,
  fetchTrafficSignalsNear,
  formatDurationZh,
  formatEtaTime,
  getManeuverIconName,
  reverseGeocodeLocation,
  reviewAdminFeedback,
  searchUnifiedPlaces,
  submitPlaceErrorFeedback,
} from '../navigation/valhalla';
import { DISPLAY_VEHICLE_PROFILES, getVehicleProfile } from '../navigation/vehicleRestrictions';
import { haversineKm } from '../services/api';

const GOBA_MASCOT = require('../assets/icon.png');

const QUICK_POI_CATEGORIES = [
  { label: '加油站', query: '加油站', icon: 'flame-outline' },
  { label: '停車場', query: '停車場', icon: 'car-outline' },
  { label: '超商', query: '7-ELEVEN', icon: 'storefront-outline' },
  { label: '美食', query: '餐廳', icon: 'restaurant-outline' },
  { label: '捷運', query: '捷運站', icon: 'train-outline' },
  { label: '醫院', query: '醫院', icon: 'medkit-outline' },
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
  onClose: () => void;
}

export const NavigationScreen: React.FC<NavigationScreenProps> = ({
  initialCenter,
  onClose,
}) => {
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const searchInputRef = useRef<any>(null);

  const nav = useNavigationState(initialCenter);

  const [styleIdx, setStyleIdx] = useState(0);
  const [useFallbackStyle, setUseFallbackStyle] = useState(false);
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
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [feedbackIssueType, setFeedbackIssueType] = useState<
    'address_wrong' | 'relocated' | 'closed' | 'name_wrong' | 'duplicate' | 'missing_place' | 'other'
  >('relocated');
  const [feedbackName, setFeedbackName] = useState('');
  const [feedbackAddress, setFeedbackAddress] = useState('');
  const [feedbackPhone, setFeedbackPhone] = useState('');
  const [feedbackHours, setFeedbackHours] = useState('');
  const [feedbackNote, setFeedbackNote] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(14.5);

  const lastCameraPushRef = useRef(0);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentMapStyle = MAP_STYLE_OPTIONS[styleIdx] || MAP_STYLE_OPTIONS[0];
  const isNight = Boolean(currentMapStyle.isNight);
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

  const effectiveStyleUrl = useMemo(
    () => getEffectiveMapStyleUrl(styleIdx, uiState === 'navigation', useFallbackStyle),
    [styleIdx, uiState, useFallbackStyle]
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

  // 合併視野內紅綠燈與當前規劃路線沿途紅綠燈（導航/路線預覽時標示 isOnRoute 並對下一個即將通過的紅綠燈發光高亮）
  const displayedTrafficSignals = useMemo(() => {
    if (!showTrafficSignals) return [];
    const routeSigs = nav.route?.trafficSignals || [];
    const nextSigId = nav.progress?.nextTrafficSignal?.id || null;
    const curShapeIdx = nav.progress?.nearestShapeIndex ?? 0;

    if (uiState === 'navigation' || uiState === 'route_preview') {
      // 路線預覽與導航時：優先顯示整條路線上的所有紅綠燈 + 車輛周邊視野紅綠燈
      const merged: Array<
        TrafficSignalNode & { isOnRoute: boolean; isPassed: boolean; isNextSignal: boolean }
      > = routeSigs.map((rs) => ({
        ...rs,
        isOnRoute: true,
        isPassed:
          uiState === 'navigation' &&
          typeof rs.shapeIndex === 'number' &&
          rs.shapeIndex <= curShapeIdx,
        isNextSignal: uiState === 'navigation' && rs.id === nextSigId,
      }));

      if (zoomLevel >= 13.8) {
        for (const vs of viewportSignals) {
          const dup = merged.some(
            (m) => Math.abs(m.lat - vs.lat) < 0.00025 && Math.abs(m.lon - vs.lon) < 0.00025
          );
          if (!dup && merged.length < 48) {
            merged.push({
              ...vs,
              isOnRoute: false,
              isPassed: false,
              isNextSignal: false,
            });
          }
        }
      }
      return merged;
    }

    // 一般瀏覽地圖（Browse）時：縮放 >= 13.2 顯示周邊紅綠燈號誌
    if (zoomLevel < 13.2) return [];
    return viewportSignals.slice(0, 42).map((vs) => ({
      ...vs,
      isOnRoute: false,
      isPassed: false,
      isNextSignal: false,
    }));
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
      if (err?.name !== 'AbortError') {
        nav.setErrorMessage(err?.message || '搜尋失敗，請稍後再試');
      }
    } finally {
      setSearching(false);
    }
  }, [searchQuery, nav, mapMovedCenter]);

  // 從搜尋頁或住家/公司選取地點：若處於設定住家/公司則綁定，否則直接進入 Route Preview
  const handleSelectPlaceFromSearch = useCallback(
    async (place: SearchPlace) => {
      Keyboard.dismiss();
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
          zoom: 16,
          duration: 500,
        });
        return;
      }
      setIsSearchOpen(false);
      setSearchResults([]);
      setNearbyPins([]);
      setActivePoiCat(null);
      setSearchQuery(place.name);
      setShowManeuvers(false);
      setSheetCollapsed(false);
      nav.setInspectedPlace(place);
      await nav.calculateRoute(place);
    },
    [bindingAnchorSlot, nav]
  );

  // Browse 狀態下點擊地圖或 POI：先展開「地點詳細資訊卡」，不強迫直接跳路線
  const handleInspectPlaceOnMap = useCallback(
    (place: SearchPlace) => {
      Keyboard.dismiss();
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
        zoom: Math.max(zoomLevel, 15.8),
        duration: 450,
      });
    },
    [nav, zoomLevel]
  );

  // 點擊或長按地圖任意處：反查台灣真實地址並顯示地點詳細資訊卡（Priority 2.6）
  const handleMapTapInspect = useCallback(
    async (event: any) => {
      if (uiState !== 'browse' || showSettingsPanel) return;
      const lngLat = event?.nativeEvent?.lngLat;
      if (!Array.isArray(lngLat) || lngLat.length < 2) return;
      Keyboard.dismiss();
      const [lon, lat] = lngLat;
      const resolved = await reverseGeocodeLocation(lat, lon);
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
    [uiState, showSettingsPanel, nav.effectiveOrigin, handleInspectPlaceOnMap]
  );

  const handleQuickPoiCategory = useCallback(
    async (catLabel: string, query: string, centerOverride?: Coordinate) => {
      if (!centerOverride && activePoiCat === catLabel) {
        setActivePoiCat(null);
        setNearbyPins([]);
        setShowSearchAreaBtn(false);
        return;
      }
      setActivePoiCat(catLabel);
      setShowSearchAreaBtn(false);
      setSearching(true);
      nav.setErrorMessage(null);
      const searchCenter = centerOverride || mapMovedCenter || nav.effectiveOrigin;
      try {
        const res = await searchUnifiedPlaces(query, {
          gpsCenter: searchCenter,
          mapCenter: searchCenter,
          sortBy: 'distance',
        });
        setNearbyPins(res.places);
        if (res.searchBasis) setSearchBasis(res.searchBasis);
        if (res.places.length > 0) {
          handleInspectPlaceOnMap(res.places[0]);
        } else {
          nav.setErrorMessage(`此區域附近暫無「${catLabel}」搜尋結果`);
        }
      } catch (err: any) {
        nav.setErrorMessage(err?.message || '附近景點搜尋失敗');
      } finally {
        setSearching(false);
      }
    },
    [activePoiCat, nav, mapMovedCenter, handleInspectPlaceOnMap]
  );

  // 地圖移動後點擊「搜尋這個區域」（Section 三.2 & 八）
  const handleSearchThisArea = useCallback(async () => {
    const center = mapMovedCenter || nav.effectiveOrigin;
    setShowSearchAreaBtn(false);
    const activeCatObj = QUICK_POI_CATEGORIES.find((c) => c.label === activePoiCat);
    const q = activeCatObj ? activeCatObj.query : searchQuery.trim() || '加油站';
    await handleQuickPoiCategory(activeCatObj?.label || q, q, center);
  }, [mapMovedCenter, nav.effectiveOrigin, activePoiCat, searchQuery, handleQuickPoiCategory]);

  const handleOpenFeedbackModal = useCallback((place?: SearchPlace | null) => {
    const target = place || nav.inspectedPlace || nav.destination;
    setFeedbackName(target?.name || '');
    setFeedbackAddress(target?.address || '');
    setFeedbackPhone(target?.phone || '');
    setFeedbackHours(target?.openingHours || '');
    setFeedbackNote('');
    setFeedbackIssueType(target ? 'relocated' : 'missing_place');
    setFeedbackModalVisible(true);
  }, [nav.inspectedPlace, nav.destination]);

  const handleSubmitFeedback = useCallback(async () => {
    const target = nav.inspectedPlace || nav.destination;
    setFeedbackSubmitting(true);
    try {
      const res = await submitPlaceErrorFeedback({
        placeId: target?.placeId || target?.id,
        issueType: feedbackIssueType,
        proposedChanges: {
          name: feedbackName.trim() || undefined,
          address: feedbackAddress.trim() || undefined,
          phone: feedbackPhone.trim() || undefined,
          opening_hours: feedbackHours.trim() || undefined,
          lat: target?.lat ?? nav.effectiveOrigin.lat,
          lon: target?.lon ?? nav.effectiveOrigin.lon,
          note: feedbackNote.trim() || undefined,
        },
        originalSnapshot: target || null,
      });
      setFeedbackModalVisible(false);
      Alert.alert('已送出地點修正回報', `${res.message}\n（回報單號 #${res.feedback_id}）`);
    } catch (err: any) {
      Alert.alert('回報失敗', err?.message || '請稍後再試');
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [
    nav.inspectedPlace,
    nav.destination,
    nav.effectiveOrigin,
    feedbackIssueType,
    feedbackName,
    feedbackAddress,
    feedbackPhone,
    feedbackHours,
    feedbackNote,
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
  }, [activeProfile, nav]);

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
  }, [nav]);

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
  }, [nav, vehicleDisplayCoord]);

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
  }, [nav, zoomLevel, is3D]);

  const handleToggle3D = useCallback(async () => {
    const next3D = !is3D;
    setIs3D(next3D);
    const center = (await mapRef.current?.getCenter().catch(() => null)) || [
      nav.effectiveOrigin.lon,
      nav.effectiveOrigin.lat,
    ];
    cameraRef.current?.easeTo({
      center,
      pitch: next3D ? 55 : 0,
      duration: 400,
    });
  }, [is3D, nav.effectiveOrigin]);

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
    [nav]
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
        onDidFailLoadingMap={() => {
          recordNavDiagnostic('map_style_fallback', 'STYLE_LOAD_FAIL');
          if (!useFallbackStyle) setUseFallbackStyle(true);
        }}
        onRegionDidChange={(e) => {
          if (typeof e?.nativeEvent?.zoom === 'number') {
            setZoomLevel(e.nativeEvent.zoom);
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
              setMapMovedCenter(moved);
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

        {/* 前方剩餘路線（外框 + 鍋巴粉／運具色主線） */}
        {remainingGeoJSON && (
          <GeoJSONSource id="goba-route-source" data={remainingGeoJSON}>
            <Layer
              id="goba-route-casing"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': activeProfile.routeCasingColor,
                'line-width': uiState === 'navigation' ? 14 : 11,
                'line-opacity': 0.92,
              }}
            />
            <Layer
              id="goba-route-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': activeProfile.routeColor,
                'line-width': uiState === 'navigation' ? 9 : 6.5,
                'line-opacity': 1,
              }}
            />
          </GeoJSONSource>
        )}

        {/* 紅綠燈號誌路口標記（清楚顯示紅黃綠三色號誌箱，沿途紅綠燈與下一個號誌路口高亮） */}
        {displayedTrafficSignals.map((sig) => (
          <Marker
            key={sig.id}
            id={`traffic-signal-${sig.id}`}
            lngLat={[sig.lon, sig.lat]}
            anchor="center"
          >
            <View
              style={[
                styles.trafficSignalHousing,
                sig.isOnRoute && styles.trafficSignalHousingOnRoute,
                sig.isNextSignal && styles.trafficSignalHousingNext,
                sig.isPassed && { opacity: 0.42 },
              ]}
            >
              <View style={[styles.trafficSignalDot, { backgroundColor: '#EF4444' }]} />
              <View style={[styles.trafficSignalDot, { backgroundColor: '#F59E0B' }]} />
              <View style={[styles.trafficSignalDot, { backgroundColor: '#10B981' }]} />
            </View>
          </Marker>
        ))}

        {/* 導航中下一個轉彎路口高亮點（Priority 1.6） */}
        {nextTurnCoord && (
          <Marker id="goba-next-turn-node" lngLat={nextTurnCoord} anchor="center">
            <View style={styles.nextTurnNodeOuter}>
              <View style={styles.nextTurnNodeInner}>
                <Ionicons
                  name={
                    getManeuverIconName(
                      nav.progress?.nextManeuver?.type ?? nav.route?.maneuvers[1]?.type ?? 8
                    ) as any
                  }
                  size={13}
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
                  name="navigate"
                  size={20}
                  color={activeProfile.routeColor}
                  style={{
                    transform: [
                      {
                        rotate: `${
                          nav.followMode === 'course'
                            ? -45
                            : Math.round((nav.gps?.headingDeg ?? 0) - 45)
                        }deg`,
                      },
                    ],
                  }}
                />
              </View>
            </View>
          </Marker>
        )}

        {/* Browse 模式附近 POI 標記 */}
        {uiState === 'browse' &&
          nearbyPins.map((pin) => (
            <Marker
              key={pin.id}
              id={`poi-${pin.id}`}
              lngLat={[pin.lon, pin.lat]}
              anchor="bottom"
              onPress={() => handleInspectPlaceOnMap(pin)}
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

      {/* ==================== 頂部區塊（依四大狀態切換） ==================== */}
      <SafeAreaView style={styles.topOverlay} pointerEvents="box-none">
        {/* 狀態 1：Browse（一般瀏覽地圖 — 僅顯示浮動搜尋列與分類捷徑，不混放車種列） */}
        {uiState === 'browse' && (
          <>
            <LiquidGlassSurface variant={isNight ? 'dark' : 'light'} interactive borderRadius={26}>
              <View style={styles.searchCapsule}>
                <TouchableOpacity
                  style={styles.capsuleBackBtn}
                  onPress={onClose}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="chevron-back"
                    size={22}
                    color={isNight ? '#F8FAFC' : '#1F2937'}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.searchTriggerArea}
                  activeOpacity={0.85}
                  onPress={() => handleOpenSearch()}
                >
                  <Ionicons name="search" size={18} color="#EC4899" />
                  <Text
                    style={[styles.searchPlaceholderText, isNight && { color: '#CBD5E1' }]}
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.25}
                  >
                    {nav.inspectedPlace ? nav.inspectedPlace.name : '搜尋台灣地點、商店或門牌...'}
                  </Text>
                </TouchableOpacity>

                {nav.inspectedPlace ? (
                  <TouchableOpacity
                    style={styles.capsuleClearBtn}
                    onPress={() => {
                      nav.setInspectedPlace(null);
                      setSearchQuery('');
                    }}
                  >
                    <Ionicons name="close-circle" size={19} color="#9CA3AF" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </LiquidGlassSurface>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipScrollRow}
            >
              {QUICK_POI_CATEGORIES.map((cat) => {
                const selected = activePoiCat === cat.label;
                return (
                  <TouchableOpacity
                    key={cat.label}
                    activeOpacity={0.85}
                    onPress={() => handleQuickPoiCategory(cat.label, cat.query)}
                  >
                    <LiquidGlassSurface
                      variant={selected ? 'dark' : isNight ? 'dark' : 'light'}
                      interactive
                      borderRadius={16}
                      contentStyle={styles.poiGlassChip}
                    >
                      <Ionicons
                        name={cat.icon as any}
                        size={13}
                        color={selected ? '#F472B6' : isNight ? '#E2E8F0' : '#4B5563'}
                      />
                      <Text
                        style={[
                          styles.poiGlassText,
                          (selected || isNight) && { color: '#FFFFFF' },
                        ]}
                        maxFontSizeMultiplier={1.2}
                      >
                        {cat.label}
                      </Text>
                    </LiquidGlassSurface>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {/* 地圖移動後顯示「搜尋這個區域」浮動按鈕（Section 三.2 & 八） */}
            {showSearchAreaBtn && (
              <TouchableOpacity
                style={{ alignSelf: 'center', marginTop: 2 }}
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
                    paddingVertical: 8,
                  }}
                >
                  <Ionicons name="refresh" size={14} color="#F472B6" />
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFFFFF' }}>
                    搜尋這個區域
                  </Text>
                </LiquidGlassSurface>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* 狀態 3：Route Preview（頂部顯示起訖點摘要膠囊） */}
        {uiState === 'route_preview' && (
          <LiquidGlassSurface variant={isNight ? 'dark' : 'light'} interactive borderRadius={24}>
            <View style={styles.previewTopBar}>
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
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.previewOriginLabel, isNight && { color: '#94A3B8' }]}
                  maxFontSizeMultiplier={1.2}
                >
                  目前位置 → 目的地
                </Text>
                <Text
                  style={[styles.previewDestTitle, isNight && { color: '#FFFFFF' }]}
                  numberOfLines={1}
                  maxFontSizeMultiplier={1.25}
                >
                  {nav.destination?.name || '選取地點'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.capsuleBackBtn}
                onPress={() => handleOpenSearch()}
              >
                <Ionicons name="search" size={18} color="#EC4899" />
              </TouchableOpacity>
            </View>
          </LiquidGlassSurface>
        )}

        {/* 狀態 4：Navigation（頂部僅顯示高對比 Turn-by-Turn 導航看板） */}
        {uiState === 'navigation' && isActiveNav && (
          <View style={{ gap: 6 }}>
            <LiquidGlassSurface variant="dark" borderRadius={26}>
              <View style={styles.navHudMain}>
                <LinearGradient colors={['#F472B6', '#DB2777']} style={styles.navHudArrowBox}>
                  <Ionicons
                    name={
                      getManeuverIconName(
                        nav.progress?.nextManeuver?.type ?? nav.route?.maneuvers[0]?.type ?? 8
                      ) as any
                    }
                    size={32}
                    color="#FFFFFF"
                  />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={styles.navHudDistance} maxFontSizeMultiplier={1.2}>
                      {formatDistanceMetersZh(nav.progress?.distanceToNextTurnMeters ?? 0)}
                    </Text>
                    {nav.progress?.nextManeuver?.hasTrafficSignal && (
                      <View style={styles.hudTrafficLightPill}>
                        <View style={styles.hudMiniTrafficLight}>
                          <View style={[styles.trafficSignalDotMini, { backgroundColor: '#EF4444' }]} />
                          <View style={[styles.trafficSignalDotMini, { backgroundColor: '#F59E0B' }]} />
                          <View style={[styles.trafficSignalDotMini, { backgroundColor: '#10B981' }]} />
                        </View>
                        <Text style={styles.hudTrafficLightPillText}>紅綠燈路口</Text>
                      </View>
                    )}
                  </View>
                  <Text
                    style={styles.navHudInstruction}
                    numberOfLines={2}
                    maxFontSizeMultiplier={1.25}
                  >
                    {nav.progress?.nextManeuver?.instruction ||
                      nav.route?.maneuvers[0]?.instruction ||
                      '沿路線前進'}
                  </Text>
                </View>
              </View>

              {nav.phase === 'off_route_recalculating' ? (
                <View style={styles.rerouteStrip}>
                  <ActivityIndicator size="small" color="#FEF3C7" />
                  <Text style={styles.rerouteStripText} maxFontSizeMultiplier={1.2}>
                    已偏離路線，Valhalla 正在重新規劃...
                  </Text>
                </View>
              ) : nav.progress?.thenManeuver ? (
                <View style={styles.thenStrip}>
                  <Text style={styles.thenLabel} maxFontSizeMultiplier={1.2}>
                    接著
                  </Text>
                  <Ionicons
                    name={getManeuverIconName(nav.progress.thenManeuver.type) as any}
                    size={14}
                    color="#F9A8D4"
                  />
                  <Text style={styles.thenText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                    {nav.progress.thenManeuver.instruction}
                  </Text>
                </View>
              ) : null}
            </LiquidGlassSurface>

            {(nav.isSimulating ||
              nav.bgLocationActive ||
              nav.rerouteCount > 0 ||
              nav.gpsSignalLost ||
              nav.gpsWeakSignal ||
              nav.rerouteOfflinePending ||
              nav.route?.headingUnverified ||
              nav.phase === 'paused' ||
              Boolean(nav.commandState)) && (
              <View style={styles.hudMetaRow}>
                <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={styles.hudTagInner}>
                  <View
                    style={[
                      styles.statusDot,
                      {
                        backgroundColor:
                          nav.commandState === 'OFF_ROUTE' || nav.commandState === 'REROUTING'
                            ? '#F59E0B'
                            : nav.commandState === 'EXECUTING_MANEUVER'
                            ? '#F472B6'
                            : nav.commandState === 'ROUTE_RECOVERED'
                            ? '#38BDF8'
                            : '#34D399',
                      },
                    ]}
                  />
                  <Text style={styles.hudTagText}>{nav.commandState}</Text>
                </LiquidGlassSurface>
                {(nav.progress?.remainingTrafficSignalCount ??
                  nav.route?.trafficSignalCount ??
                  0) > 0 && (
                  <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={styles.hudTagInner}>
                    <View style={styles.hudMiniTrafficLight}>
                      <View style={[styles.trafficSignalDotMini, { backgroundColor: '#EF4444' }]} />
                      <View style={[styles.trafficSignalDotMini, { backgroundColor: '#F59E0B' }]} />
                      <View style={[styles.trafficSignalDotMini, { backgroundColor: '#10B981' }]} />
                    </View>
                    <Text style={styles.hudTagText}>
                      {typeof nav.progress?.distanceToNextTrafficSignalMeters === 'number'
                        ? `下個紅綠燈 ${formatDistanceMetersZh(
                            nav.progress.distanceToNextTrafficSignalMeters
                          )} • 剩 ${nav.progress.remainingTrafficSignalCount} 個`
                        : `沿途 ${nav.route?.trafficSignalCount ?? 0} 個紅綠燈`}
                    </Text>
                  </LiquidGlassSurface>
                )}
                {nav.route?.headingUnverified && (
                  <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={styles.hudTagInner}>
                    <Ionicons name="warning" size={12} color="#FBBF24" />
                    <Text style={styles.hudTagText}>迴轉限制資料不足，請依現場標誌行駛</Text>
                  </LiquidGlassSurface>
                )}
                {nav.phase === 'paused' && (
                  <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={styles.hudTagInner}>
                    <View style={[styles.statusDot, { backgroundColor: '#F59E0B' }]} />
                    <Text style={styles.hudTagText}>導航已暫停</Text>
                  </LiquidGlassSurface>
                )}
                {nav.gpsSignalLost && (
                  <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={styles.hudTagInner}>
                    <View style={[styles.statusDot, { backgroundColor: '#EF4444' }]} />
                    <Text style={styles.hudTagText}>GPS 訊號中斷，等待恢復...</Text>
                  </LiquidGlassSurface>
                )}
                {!nav.gpsSignalLost && nav.gpsWeakSignal && (
                  <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={styles.hudTagInner}>
                    <View style={[styles.statusDot, { backgroundColor: '#F59E0B' }]} />
                    <Text style={styles.hudTagText}>
                      GPS 精度較弱 (±{Math.round(nav.gps?.accuracyMeters ?? 50)}m)
                    </Text>
                  </LiquidGlassSurface>
                )}
                {nav.rerouteOfflinePending && (
                  <TouchableOpacity
                    onPress={() => {
                      if (nav.gps) {
                        nav.triggerOffRouteReroute({ lat: nav.gps.lat, lon: nav.gps.lon });
                      }
                    }}
                  >
                    <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={styles.hudTagInner}>
                      <Ionicons name="refresh" size={12} color="#FBBF24" />
                      <Text style={styles.hudTagText}>網路恢復後點此重算</Text>
                    </LiquidGlassSurface>
                  </TouchableOpacity>
                )}
                {nav.isSimulating && (
                  <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={styles.hudTagInner}>
                    <View style={[styles.statusDot, { backgroundColor: '#FBBF24' }]} />
                    <Text style={styles.hudTagText}>模擬導航中</Text>
                  </LiquidGlassSurface>
                )}
                {nav.bgLocationActive && (
                  <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={styles.hudTagInner}>
                    <View style={[styles.statusDot, { backgroundColor: '#34D399' }]} />
                    <Text style={styles.hudTagText}>背景導航中</Text>
                  </LiquidGlassSurface>
                )}
              </View>
            )}
          </View>
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
      </SafeAreaView>

      {/* ==================== 右側控制列（導航時隱藏非必要按鈕，Priority 2.4 & 2.7） ==================== */}
      {uiState !== 'search' && (
        <View style={styles.rightDockWrap}>
          {uiState === 'navigation' ? (
            /* 正式導航時僅保留：語音開關 + 全覽路線切換 */
            <LiquidGlassSurface variant="dark" interactive borderRadius={22}>
              <TouchableOpacity style={styles.dockBtn} onPress={nav.toggleVoice} activeOpacity={0.7}>
                <Ionicons
                  name={nav.voiceEnabled ? 'volume-high' : 'volume-mute'}
                  size={19}
                  color={nav.voiceEnabled ? '#FFFFFF' : '#94A3B8'}
                />
              </TouchableOpacity>
              <View style={[styles.dockDivider, { backgroundColor: 'rgba(255,255,255,0.16)' }]} />
              <TouchableOpacity
                style={styles.dockBtn}
                onPress={
                  nav.followMode === 'course' ? handleOverviewRoute : handleRecenterCockpit
                }
                activeOpacity={0.7}
              >
                <Ionicons
                  name={nav.followMode === 'course' ? 'map-outline' : 'navigate'}
                  size={18}
                  color="#F472B6"
                />
              </TouchableOpacity>
            </LiquidGlassSurface>
          ) : (
            /* Browse / Route Preview 時保留：定位、日間/夜間圖層、2D/3D 視角與設定 */
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
                onPress={() => setStyleIdx((prev) => (prev + 1) % MAP_STYLE_OPTIONS.length)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={isNight ? 'moon' : 'sunny-outline'}
                  size={19}
                  color={isNight ? '#F472B6' : '#1F2937'}
                />
              </TouchableOpacity>
              <View style={styles.dockDivider} />
              <TouchableOpacity style={styles.dockBtn} onPress={handleToggle3D} activeOpacity={0.7}>
                <Text
                  style={[
                    styles.dock3DText,
                    isNight && { color: '#F8FAFC' },
                    is3D && { color: '#EC4899' },
                  ]}
                >
                  {is3D ? '3D' : '2D'}
                </Text>
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
                onPress={() => setStyleIdx((prev) => (prev + 1) % MAP_STYLE_OPTIONS.length)}
              >
                <Text style={styles.optChipText}>底圖：{currentMapStyle.label}</Text>
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
                onPress={() => {
                  if (nav.speedKmh > 3 && !nav.isSimulating) {
                    Alert.alert('行車安全保護', '請於車輛靜止時或由乘客操作 GPS 軌跡回放測試。');
                    return;
                  }
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

      {/* 導航中左下角車速球與回到車頭視角 */}
      {uiState === 'navigation' && isActiveNav && (
        <>
          <View style={styles.speedWrap}>
            <LiquidGlassSurface variant="dark" borderRadius={31} contentStyle={styles.speedInner}>
              <Text style={styles.speedValue} maxFontSizeMultiplier={1.15}>
                {nav.speedKmh}
              </Text>
              <Text style={styles.speedUnit}>km/h</Text>
            </LiquidGlassSurface>
          </View>

          {nav.followMode !== 'course' && (
            <TouchableOpacity
              style={styles.recenterWrap}
              onPress={handleRecenterCockpit}
              activeOpacity={0.85}
            >
              <LiquidGlassSurface
                variant="dark"
                interactive
                borderRadius={22}
                contentStyle={styles.recenterInner}
              >
                <Ionicons name="navigate" size={15} color="#F472B6" />
                <Text style={styles.recenterText}>回到車頭視角</Text>
              </LiquidGlassSurface>
            </TouchableOpacity>
          )}
        </>
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

                          <TouchableOpacity
                            style={styles.inlineRouteBtn}
                            onPress={() => handleSelectPlaceFromSearch(p)}
                          >
                            <Ionicons name="navigate" size={13} color="#FFFFFF" />
                            <Text style={styles.inlineRouteBtnText}>路線</Text>
                          </TouchableOpacity>
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

      {/* ==================== 底部可收合動態資訊卡（Priority 2.5：依 Browse / Route Preview / Navigation 切換） ==================== */}
      {uiState !== 'search' && (
        <View style={styles.bottomSheetOuter}>
          <LiquidGlassSurface
            variant={isNight ? 'dark' : 'light'}
            borderRadius={28}
            contentStyle={styles.bottomSheetInner}
          >
            {/* 可收合拖曳把（點擊可收合／展開底部卡片） */}
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

            {/* ---------- 狀態 A：Browse（點擊地圖地點詳細資訊卡 or 快捷通勤抽屜） ---------- */}
            {uiState === 'browse' && (
              <>
                {nav.inspectedPlace ? (
                  <View style={{ gap: 10 }}>
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

                    <View style={styles.browseHeaderRow}>
                      <View>
                        <Text
                          style={[styles.idleTitle, isNight && { color: '#FFFFFF' }]}
                          maxFontSizeMultiplier={1.2}
                        >
                          鍋巴地圖 GOBA Maps
                        </Text>
                        <Text style={styles.idleDesc} maxFontSizeMultiplier={1.2}>
                          點擊地圖任意地點查看詳情，或選擇常用目的地出發
                        </Text>
                      </View>
                      <TouchableOpacity onPress={() => setSheetCollapsed((c) => !c)}>
                        <Ionicons
                          name={sheetCollapsed ? 'chevron-up' : 'chevron-down'}
                          size={18}
                          color="#9CA3AF"
                        />
                      </TouchableOpacity>
                    </View>

                    {!sheetCollapsed && (
                      <View style={styles.commuteRow}>
                        <TouchableOpacity
                          style={[
                            styles.commuteCard,
                            isNight && { backgroundColor: 'rgba(255,255,255,0.08)' },
                          ]}
                          onPress={() =>
                            nav.commuteAnchors.home
                              ? nav.calculateRoute(nav.commuteAnchors.home)
                              : handleOpenSearch('home')
                          }
                        >
                          <View style={styles.commuteIconBox}>
                            <Ionicons name="home" size={17} color="#EC4899" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.commuteTitle, isNight && { color: '#FFFFFF' }]}>
                              回家
                            </Text>
                            <Text style={styles.commuteSub} numberOfLines={1}>
                              {nav.commuteAnchors.home
                                ? nav.commuteAnchors.home.name
                                : '設定住家'}
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
                              ? nav.calculateRoute(nav.commuteAnchors.work)
                              : handleOpenSearch('work')
                          }
                        >
                          <View style={[styles.commuteIconBox, { backgroundColor: '#EFF6FF' }]}>
                            <Ionicons name="briefcase" size={16} color="#3B82F6" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.commuteTitle, isNight && { color: '#FFFFFF' }]}>
                              去公司
                            </Text>
                            <Text style={styles.commuteSub} numberOfLines={1}>
                              {nav.commuteAnchors.work
                                ? nav.commuteAnchors.work.name
                                : '設定公司'}
                            </Text>
                          </View>
                        </TouchableOpacity>
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
                                  <Ionicons
                                    name={getManeuverIconName(m.type) as any}
                                    size={15}
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
                    </View>

                    {!sheetCollapsed && (
                      <View style={styles.actionRow}>
                        <TouchableOpacity
                          style={styles.iconActionBtn}
                          onPress={() => setShowManeuvers((v) => !v)}
                        >
                          <Ionicons
                            name={showManeuvers ? 'chevron-down' : 'list'}
                            size={18}
                            color="#1F2937"
                          />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.secondaryBtn}
                          onPress={
                            nav.phase === 'paused' ? nav.resumeNavigation : nav.pauseNavigation
                          }
                        >
                          <Ionicons
                            name={nav.phase === 'paused' ? 'play' : 'pause'}
                            size={16}
                            color="#1F2937"
                          />
                          <Text style={styles.secondaryBtnText}>
                            {nav.phase === 'paused' ? '繼續' : '暫停'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={{ flex: 1.25 }}
                          activeOpacity={0.9}
                          onPress={nav.stopNavigation}
                        >
                          <LinearGradient
                            colors={['#EF4444', '#DC2626']}
                            style={styles.primaryGradBtn}
                          >
                            <Ionicons name="stop-circle" size={17} color="#FFFFFF" />
                            <Text style={styles.primaryBtnText}>結束導航</Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    )}

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
                                <Ionicons
                                  name={getManeuverIconName(m.type) as any}
                                  size={15}
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
                { key: 'other', label: '其他問題' },
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
              placeholder="正確商家名稱（如：味朋餐廳）"
              placeholderTextColor="#9CA3AF"
              value={feedbackName}
              onChangeText={setFeedbackName}
            />
            <TextInput
              style={styles.feedbackInput}
              placeholder="正確完整地址（如：新北市林口區民族路96號1樓）"
              placeholderTextColor="#9CA3AF"
              value={feedbackAddress}
              onChangeText={setFeedbackAddress}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.feedbackInput, { flex: 1 }]}
                placeholder="電話（選填）"
                placeholderTextColor="#9CA3AF"
                value={feedbackPhone}
                onChangeText={setFeedbackPhone}
              />
              <TextInput
                style={[styles.feedbackInput, { flex: 1 }]}
                placeholder="營業時間（選填）"
                placeholderTextColor="#9CA3AF"
                value={feedbackHours}
                onChangeText={setFeedbackHours}
              />
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
