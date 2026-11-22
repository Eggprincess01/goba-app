import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
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
import { MAP_STYLE_OPTIONS } from '../navigation/mapStyle';
import { recordNavDiagnostic } from '../navigation/diagnostics';
import { formatDistanceMetersZh, splitRouteCoords } from '../navigation/navEngine';
import { Coordinate, SearchPlace } from '../navigation/types';
import { useNavigationState } from '../navigation/useNavigationState';
import {
  formatDurationZh,
  formatEtaTime,
  getManeuverIconName,
  reverseGeocodeLocation,
  searchDestinationPlaces,
} from '../navigation/valhalla';
import { DISPLAY_VEHICLE_PROFILES, getVehicleProfile } from '../navigation/vehicleRestrictions';

const QUICK_POI_CATEGORIES = [
  { label: '加油站', query: '加油站', icon: 'flame-outline' },
  { label: '停車場', query: '停車場', icon: 'car-outline' },
  { label: '超商', query: '7-ELEVEN', icon: 'storefront-outline' },
  { label: '美食', query: '餐廳', icon: 'restaurant-outline' },
  { label: '捷運', query: '捷運站', icon: 'train-outline' },
  { label: '醫院', query: '醫院', icon: 'medkit-outline' },
];

const COCKPIT_CAMERA_PADDING = { top: 265, right: 0, bottom: 30, left: 0 };

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

  const nav = useNavigationState(initialCenter);

  const [styleIdx, setStyleIdx] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchPlace[]>([]);
  const [nearbyPins, setNearbyPins] = useState<SearchPlace[]>([]);
  const [activePoiCat, setActivePoiCat] = useState<string | null>(null);
  const [showManeuvers, setShowManeuvers] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
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
  const activeProfile = getVehicleProfile(nav.vehicleType);
  const isDestFavorite = useMemo(() => {
    if (!nav.destination) return false;
    return nav.favoritePlaces.some(
      (f) =>
        f.name === nav.destination?.name &&
        Math.abs(f.lat - (nav.destination?.lat || 0)) < 0.001
    );
  }, [nav.destination, nav.favoritePlaces]);

  const mapLibreTrackMode: TrackUserLocation | undefined = useMemo(() => {
    if (isActiveNav || nav.isSimulating) return undefined;
    if (nav.followMode === 'follow') return 'default';
    if (nav.followMode === 'heading') return 'heading';
    if (nav.followMode === 'course') return 'course';
    return undefined;
  }, [nav.followMode, nav.isSimulating, isActiveNav]);

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

  useEffect(() => {
    if (nav.route && nav.phase === 'route_preview') {
      const [west, south, east, north] = nav.route.bbox;
      nav.setFollowMode('free');
      setIs3D(false);
      setTimeout(() => {
        cameraRef.current?.fitBounds([west, south, east, north], {
          padding: { top: 180, right: 50, bottom: 300, left: 50 },
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

  // Google Maps 風格 3D 車輛座艙視角（64° 傾角 + 下方 1/3 焦點 + 線性滑順推進）
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
          const list = await searchDestinationPlaces(trimmed, nav.effectiveOrigin);
          setSearchResults(list);
        } catch {
          // ignore transient typing errors
        } finally {
          setSearching(false);
        }
      }, 350);
    },
    [nav.effectiveOrigin]
  );

  const handleSearchSubmit = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;
    Keyboard.dismiss();
    setSearching(true);
    nav.setErrorMessage(null);
    try {
      const list = await searchDestinationPlaces(q, nav.effectiveOrigin);
      setSearchResults(list);
      if (list.length === 0) {
        nav.setErrorMessage(`找不到「${q}」，請嘗試輸入完整路名或地標`);
      }
    } catch (err: any) {
      nav.setErrorMessage(err?.message || '搜尋失敗，請稍後再試');
    } finally {
      setSearching(false);
    }
  }, [searchQuery, nav]);

  const handleSelectPlace = useCallback(
    async (place: SearchPlace) => {
      Keyboard.dismiss();
      setSearchResults([]);
      setNearbyPins([]);
      setActivePoiCat(null);
      setSearchQuery(place.name);
      setShowManeuvers(false);
      await nav.calculateRoute(place);
    },
    [nav]
  );

  const handleQuickPoiCategory = useCallback(
    async (catLabel: string, query: string) => {
      if (activePoiCat === catLabel) {
        setActivePoiCat(null);
        setNearbyPins([]);
        return;
      }
      setActivePoiCat(catLabel);
      setSearching(true);
      nav.setErrorMessage(null);
      try {
        const list = await searchDestinationPlaces(query, nav.effectiveOrigin);
        setNearbyPins(list);
        if (list.length > 0) {
          cameraRef.current?.easeTo({
            center: [list[0].lon, list[0].lat],
            zoom: 14.5,
            duration: 500,
          });
        } else {
          nav.setErrorMessage(`附近暫無「${catLabel}」搜尋結果`);
        }
      } catch (err: any) {
        nav.setErrorMessage(err?.message || '附近景點搜尋失敗');
      } finally {
        setSearching(false);
      }
    },
    [activePoiCat, nav]
  );

  // 導航途中一鍵查看完整路線（Section D.7）
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

  // 點擊或長按地圖即可設定目的地（Section C.3）
  const handleMapTapSetDestination = useCallback(
    async (event: any) => {
      if (isActiveNav || searchResults.length > 0 || showSettingsPanel) return;
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
        category: 'pin',
      };
      setSearchResults([]);
      setNearbyPins([]);
      setActivePoiCat(null);
      setSearchQuery(droppedPlace.name);
      await nav.calculateRoute(droppedPlace);
    },
    [nav, isActiveNav, searchResults.length, showSettingsPanel]
  );

  // 普通機車／大型重機於道路限制驗證完成前不得作為正式可靠導航：啟動前強制顯示安全確認
  const handleStartNavigationPress = useCallback(() => {
    if (!activeProfile.isProductionVerified) {
      Alert.alert(
        `${activeProfile.label}模式（路網驗證中）`,
        `${activeProfile.verificationNote}\n\n本模式尚未完成全台禁行機車與快速道路匝道驗證，僅供參考測試，行駛時務必以現場交通標誌為準。`,
        [
          { text: '改用汽車模式', onPress: () => nav.setVehicleType('car') },
          { text: '僅供測試繼續', style: 'destructive', onPress: () => nav.startNavigation() },
        ]
      );
      return;
    }
    nav.startNavigation();
  }, [activeProfile, nav]);

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

  const handleZoom = useCallback(
    async (delta: number) => {
      const current = (await mapRef.current?.getZoom().catch(() => zoomLevel)) ?? zoomLevel;
      const next = Math.max(4, Math.min(19, current + delta));
      setZoomLevel(next);
      cameraRef.current?.zoomTo(next, { duration: 250 });
    },
    [zoomLevel]
  );

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
    <View style={styles.root}>
      {/* MapLibre Native 向量地圖 */}
      <Map
        ref={mapRef}
        style={styles.map}
        mapStyle={currentMapStyle.url}
        touchRotate
        touchPitch
        touchZoom
        dragPan
        compass
        compassPosition={{ top: isActiveNav ? 195 : 185, left: 16 }}
        attributionPosition={{ bottom: 6, left: 10 }}
        onPress={handleMapTapSetDestination}
        onLongPress={handleMapTapSetDestination}
        onDidFailLoadingMap={() => {
          recordNavDiagnostic('map_style_fallback', 'STYLE_LOAD_FAIL');
          if (styleIdx !== 0) setStyleIdx(0);
        }}
        onRegionDidChange={(e) => {
          if (typeof e?.nativeEvent?.zoom === 'number') {
            setZoomLevel(e.nativeEvent.zoom);
          }
          if (e?.nativeEvent?.userInteraction && nav.followMode !== 'free') {
            nav.setFollowMode('free');
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

        {nav.gpsPermission === 'granted' && !isActiveNav && (
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
                'line-color': '#9CA3AF',
                'line-width': 7,
                'line-opacity': 0.72,
              }}
            />
          </GeoJSONSource>
        )}

        {/* 前方剩餘路線（外框 + 高亮主線） */}
        {remainingGeoJSON && (
          <GeoJSONSource id="goba-route-source" data={remainingGeoJSON}>
            <Layer
              id="goba-route-casing"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': activeProfile.routeCasingColor,
                'line-width': isActiveNav ? 14 : 11,
                'line-opacity': 0.9,
              }}
            />
            <Layer
              id="goba-route-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': activeProfile.routeColor,
                'line-width': isActiveNav ? 9 : 6.5,
                'line-opacity': 1,
              }}
            />
          </GeoJSONSource>
        )}

        {/* 導航中 3D 車輛指向游標 */}
        {isActiveNav && vehicleDisplayCoord && (
          <Marker id="goba-vehicle-puck" lngLat={vehicleDisplayCoord} anchor="center">
            <View style={styles.vehiclePuckHalo}>
              <View style={[styles.vehiclePuckCore, { borderColor: activeProfile.routeColor }]}>
                <Ionicons
                  name="navigate"
                  size={20}
                  color={activeProfile.routeColor}
                  style={{ transform: [{ rotate: '-45deg' }] }}
                />
              </View>
            </View>
          </Marker>
        )}

        {/* 附近快速搜尋 POI 標記 */}
        {!isActiveNav &&
          nearbyPins.map((pin) => (
            <Marker
              key={pin.id}
              id={`poi-${pin.id}`}
              lngLat={[pin.lon, pin.lat]}
              anchor="bottom"
              onPress={() => handleSelectPlace(pin)}
            >
              <View style={styles.poiPinWrap}>
                <View style={styles.poiPinBubble}>
                  <Ionicons name="location" size={14} color="#FFFFFF" />
                </View>
                <Text style={styles.poiPinLabel} numberOfLines={1}>
                  {pin.name}
                </Text>
              </View>
            </Marker>
          ))}

        {/* 目的地旗幟標記 */}
        {nav.destination && (
          <Marker
            id="goba-destination-marker"
            lngLat={[nav.destination.lon, nav.destination.lat]}
            anchor="bottom"
          >
            <View style={styles.destMarkerWrap}>
              <LinearGradient
                colors={['#F472B6', '#DB2777']}
                style={styles.destMarkerBadge}
              >
                <Ionicons name="flag" size={15} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.destMarkerTip} />
            </View>
          </Marker>
        )}
      </Map>

      {/* 夜間護眼暗色濾鏡層（不阻擋地圖觸控） */}
      {isNight && (
        <View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(10, 15, 28, 0.34)' }]}
        />
      )}

      {/* 頂部介面：Apple Liquid Glass Turn-by-Turn HUD 或懸浮搜尋膠囊 */}
      <SafeAreaView style={styles.topOverlay} pointerEvents="box-none">
        {isActiveNav ? (
          <View style={{ gap: 6 }}>
            <LiquidGlassSurface variant="dark" borderRadius={26}>
              <View style={styles.navHudMain}>
                <LinearGradient
                  colors={['#F472B6', '#DB2777']}
                  style={styles.navHudArrowBox}
                >
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
                  <Text style={styles.navHudDistance}>
                    {formatDistanceMetersZh(nav.progress?.distanceToNextTurnMeters ?? 0)}
                  </Text>
                  <Text style={styles.navHudInstruction} numberOfLines={2}>
                    {nav.progress?.nextManeuver?.instruction ||
                      nav.route?.maneuvers[0]?.instruction ||
                      '沿路線前進'}
                  </Text>
                </View>
              </View>

              {nav.phase === 'off_route_recalculating' ? (
                <View style={styles.rerouteStrip}>
                  <ActivityIndicator size="small" color="#FEF3C7" />
                  <Text style={styles.rerouteStripText}>已偏離路線，Valhalla 正在重新規劃...</Text>
                </View>
              ) : nav.progress?.thenManeuver ? (
                <View style={styles.thenStrip}>
                  <Text style={styles.thenLabel}>接著</Text>
                  <Ionicons
                    name={getManeuverIconName(nav.progress.thenManeuver.type) as any}
                    size={14}
                    color="#F9A8D4"
                  />
                  <Text style={styles.thenText} numberOfLines={1}>
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
              nav.phase === 'paused') && (
              <View style={styles.hudMetaRow}>
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
                    <Text style={styles.hudTagText}>模擬測試</Text>
                  </LiquidGlassSurface>
                )}
                {nav.bgLocationActive && (
                  <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={styles.hudTagInner}>
                    <View style={[styles.statusDot, { backgroundColor: '#34D399' }]} />
                    <Text style={styles.hudTagText}>背景導航中</Text>
                  </LiquidGlassSurface>
                )}
                {nav.rerouteCount > 0 && (
                  <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={styles.hudTagInner}>
                    <Text style={styles.hudTagText}>已重算 {nav.rerouteCount} 次</Text>
                  </LiquidGlassSurface>
                )}
              </View>
            )}
          </View>
        ) : (
          <>
            {/* Apple Maps 風格一體化 Liquid Glass 搜尋膠囊 */}
            <LiquidGlassSurface variant="light" interactive borderRadius={26}>
              <View style={styles.searchCapsule}>
                <TouchableOpacity style={styles.capsuleBackBtn} onPress={onClose} activeOpacity={0.7}>
                  <Ionicons name="chevron-back" size={22} color="#1F2937" />
                </TouchableOpacity>
                <Ionicons name="search" size={18} color="#9D174D" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="搜尋地點、商店或門牌"
                  placeholderTextColor="#6B7280"
                  value={searchQuery}
                  onChangeText={handleQueryChange}
                  returnKeyType="search"
                  onSubmitEditing={handleSearchSubmit}
                />
                {searching ? (
                  <ActivityIndicator size="small" color="#DB2777" style={{ marginRight: 6 }} />
                ) : searchQuery.length > 0 ? (
                  <TouchableOpacity
                    style={styles.capsuleClearBtn}
                    onPress={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                      nav.clearRoute();
                    }}
                  >
                    <Ionicons name="close-circle" size={19} color="#9CA3AF" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </LiquidGlassSurface>

            {/* 六大運具液態玻璃膠囊列 */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipScrollRow}
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
                      <LiquidGlassSurface
                        variant="light"
                        interactive
                        borderRadius={18}
                        contentStyle={styles.vehiclePillGlass}
                      >
                        <Ionicons name={v.iconName as any} size={14} color="#374151" />
                        <Text style={styles.vehiclePillText}>{v.shortLabel}</Text>
                      </LiquidGlassSurface>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 閒置時顯示附近景點快捷玻璃膠囊 */}
            {!nav.route && searchResults.length === 0 && (
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
                        variant={selected ? 'dark' : 'light'}
                        interactive
                        borderRadius={16}
                        contentStyle={styles.poiGlassChip}
                      >
                        <Ionicons
                          name={cat.icon as any}
                          size={13}
                          color={selected ? '#FFFFFF' : '#4B5563'}
                        />
                        <Text
                          style={[styles.poiGlassText, selected && { color: '#FFFFFF' }]}
                        >
                          {cat.label}
                        </Text>
                      </LiquidGlassSurface>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* 收藏地點與最近搜尋快捷膠囊（Section K.4） */}
            {!nav.route &&
              searchResults.length === 0 &&
              (nav.favoritePlaces.length > 0 || nav.recentPlaces.length > 0) && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipScrollRow}
                >
                  {nav.favoritePlaces.slice(0, 4).map((fav) => (
                    <TouchableOpacity
                      key={`fav-${fav.id}`}
                      activeOpacity={0.85}
                      onPress={() => handleSelectPlace(fav)}
                    >
                      <LiquidGlassSurface
                        variant="sakura"
                        interactive
                        borderRadius={16}
                        contentStyle={styles.poiGlassChip}
                      >
                        <Ionicons name="star" size={12} color="#DB2777" />
                        <Text style={[styles.poiGlassText, { color: '#831843' }]} numberOfLines={1}>
                          {fav.name}
                        </Text>
                      </LiquidGlassSurface>
                    </TouchableOpacity>
                  ))}
                  {nav.recentPlaces.slice(0, 4).map((rec) => (
                    <TouchableOpacity
                      key={`rec-${rec.id}`}
                      activeOpacity={0.85}
                      onPress={() => handleSelectPlace(rec)}
                    >
                      <LiquidGlassSurface
                        variant="light"
                        interactive
                        borderRadius={16}
                        contentStyle={styles.poiGlassChip}
                      >
                        <Ionicons name="time-outline" size={12} color="#6B7280" />
                        <Text style={styles.poiGlassText} numberOfLines={1}>
                          {rec.name}
                        </Text>
                      </LiquidGlassSurface>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

            {/* 導航中斷恢復玻璃提示卡 */}
            {nav.recoverableSession && !nav.route && (
              <LiquidGlassSurface variant="sakura" borderRadius={18} contentStyle={styles.recoverRow}>
                <Ionicons name="refresh-circle" size={24} color="#DB2777" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.recoverTitle}>恢復中斷的導航？</Text>
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
                <TouchableOpacity onPress={nav.dismissRecoveredSession} style={{ padding: 4 }}>
                  <Ionicons name="close" size={16} color="#9D174D" />
                </TouchableOpacity>
              </LiquidGlassSurface>
            )}

            {/* 搜尋結果玻璃下拉卡片 */}
            {searchResults.length > 0 && (
              <LiquidGlassSurface variant="light" borderRadius={20}>
                <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 270 }}>
                  {searchResults.map((p, idx) => (
                    <TouchableOpacity
                      key={p.id}
                      style={[
                        styles.searchItem,
                        idx === searchResults.length - 1 && { borderBottomWidth: 0 },
                      ]}
                      onPress={() => handleSelectPlace(p)}
                    >
                      <View style={styles.searchItemIcon}>
                        <Ionicons name="location" size={16} color="#DB2777" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.searchItemTitle} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <Text style={styles.searchItemAddr} numberOfLines={1}>
                          {p.address}
                        </Text>
                      </View>
                      {typeof p.distanceKm === 'number' && (
                        <Text style={styles.searchDistText}>{p.distanceKm.toFixed(1)} km</Text>
                      )}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </LiquidGlassSurface>
            )}
          </>
        )}

        {(nav.errorMessage || nav.gpsPermission === 'denied') && (
          <LiquidGlassSurface variant="light" borderRadius={16} contentStyle={styles.bannerError}>
            <Ionicons name="alert-circle" size={16} color="#DC2626" />
            <Text style={styles.bannerErrorText}>
              {nav.errorMessage || '尚未取得 GPS 定位權限，目前使用預設區域座標規劃路線。'}
            </Text>
            {nav.gpsPermission === 'denied' && (
              <TouchableOpacity
                onPress={() => Linking.openSettings().catch(() => {})}
                style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: '#FEE2E2' }}
              >
                <Text style={{ fontSize: 11, fontWeight: '700', color: '#B91C1C' }}>開啟設定</Text>
              </TouchableOpacity>
            )}
          </LiquidGlassSurface>
        )}
      </SafeAreaView>

      {/* 右側 Apple Maps 風格一體化 Liquid Glass 控制島 */}
      <View style={styles.rightDockWrap}>
        <LiquidGlassSurface variant="light" interactive borderRadius={22}>
          <TouchableOpacity style={styles.dockBtn} onPress={nav.toggleVoice} activeOpacity={0.7}>
            <Ionicons
              name={nav.voiceEnabled ? 'volume-high' : 'volume-mute'}
              size={19}
              color={nav.voiceEnabled ? '#1F2937' : '#9CA3AF'}
            />
          </TouchableOpacity>
          <View style={styles.dockDivider} />
          <TouchableOpacity
            style={styles.dockBtn}
            onPress={() => setStyleIdx((prev) => (prev + 1) % MAP_STYLE_OPTIONS.length)}
            activeOpacity={0.7}
          >
            <Ionicons name={isNight ? 'moon' : 'sunny-outline'} size={19} color={isNight ? '#6366F1' : '#1F2937'} />
          </TouchableOpacity>
          <View style={styles.dockDivider} />
          <TouchableOpacity
            style={styles.dockBtn}
            onPress={() => setShowSettingsPanel((v) => !v)}
            activeOpacity={0.7}
          >
            <Ionicons name="options-outline" size={19} color={showSettingsPanel ? '#DB2777' : '#1F2937'} />
          </TouchableOpacity>
        </LiquidGlassSurface>

        <LiquidGlassSurface variant="light" interactive borderRadius={22}>
          <TouchableOpacity
            style={styles.dockBtn}
            onPress={handleCycleFollowMode}
            activeOpacity={0.7}
          >
            <Ionicons
              name={followIconName as any}
              size={19}
              color={nav.followMode !== 'free' ? '#DB2777' : '#1F2937'}
            />
          </TouchableOpacity>
          {nav.route && (
            <>
              <View style={styles.dockDivider} />
              <TouchableOpacity
                style={styles.dockBtn}
                onPress={handleOverviewRoute}
                activeOpacity={0.7}
              >
                <Ionicons name="map-outline" size={18} color="#1F2937" />
              </TouchableOpacity>
            </>
          )}
          <View style={styles.dockDivider} />
          <TouchableOpacity style={styles.dockBtn} onPress={handleToggle3D} activeOpacity={0.7}>
            <Text style={[styles.dock3DText, is3D && { color: '#DB2777' }]}>
              {is3D ? '3D' : '2D'}
            </Text>
          </TouchableOpacity>
          <View style={styles.dockDivider} />
          <TouchableOpacity style={styles.dockBtn} onPress={() => handleZoom(1)} activeOpacity={0.7}>
            <Ionicons name="add" size={20} color="#1F2937" />
          </TouchableOpacity>
          <View style={styles.dockDivider} />
          <TouchableOpacity
            style={styles.dockBtn}
            onPress={() => handleZoom(-1)}
            activeOpacity={0.7}
          >
            <Ionicons name="remove" size={20} color="#1F2937" />
          </TouchableOpacity>
        </LiquidGlassSurface>
      </View>

      {/* 語音設定、地圖樣式與隱私安全診斷面板（Section E.7 / I.7 / K.3 / K.5） */}
      {showSettingsPanel && (
        <View style={styles.settingsOverlay}>
          <LiquidGlassSurface variant="light" borderRadius={22} contentStyle={{ padding: 16, gap: 10 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#111827' }}>
                導航語音與系統診斷
              </Text>
              <TouchableOpacity onPress={() => setShowSettingsPanel(false)}>
                <Ionicons name="close-circle" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <TouchableOpacity style={styles.optChip} onPress={nav.cycleVoiceRate}>
                <Text style={styles.optChipText}>
                  語速：{nav.voiceRate < 0.95 ? '慢速' : nav.voiceRate > 1.05 ? '快速' : '標準'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.optChip} onPress={nav.testVoiceGuidance}>
                <Text style={styles.optChipText}>測試語音（喇叭／藍牙）</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.optChip}
                onPress={() => setStyleIdx((prev) => (prev + 1) % MAP_STYLE_OPTIONS.length)}
              >
                <Text style={styles.optChipText}>樣式：{currentMapStyle.label}</Text>
              </TouchableOpacity>
            </View>

            <Text style={{ fontSize: 11, fontWeight: '700', color: '#6B7280', marginTop: 2 }}>
              隱私安全診斷紀錄（不含任何座標或個人位置資訊）
            </Text>
            <ScrollView style={{ maxHeight: 110 }}>
              {nav.getDiagnostics().length === 0 ? (
                <Text style={{ fontSize: 11, color: '#9CA3AF' }}>目前無異常事件紀錄</Text>
              ) : (
                nav.getDiagnostics().slice(0, 8).map((d) => (
                  <Text key={d.id} style={{ fontSize: 11, color: '#374151', marginBottom: 2 }}>
                    • [{new Date(d.timestamp).toLocaleTimeString()}] {d.type} ({d.code})
                    {d.latencyMs ? ` ${d.latencyMs}ms` : ''}
                  </Text>
                ))
              )}
            </ScrollView>
          </LiquidGlassSurface>
        </View>
      )}

      {/* 導航中左下角深色 Liquid Glass 車速球 */}
      {isActiveNav && (
        <View style={styles.speedWrap}>
          <LiquidGlassSurface variant="dark" borderRadius={31} contentStyle={styles.speedInner}>
            <Text style={styles.speedValue}>{nav.speedKmh}</Text>
            <Text style={styles.speedUnit}>km/h</Text>
          </LiquidGlassSurface>
        </View>
      )}

      {/* 導航中手動滑動地圖後的「回到車頭視角」玻璃膠囊 */}
      {isActiveNav && nav.followMode !== 'course' && (
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

      {/* 底部 Apple Maps 風格拉起式 Liquid Glass 卡片 */}
      <View style={styles.bottomSheetOuter}>
        <LiquidGlassSurface variant="light" borderRadius={28} contentStyle={styles.bottomSheetInner}>
          <View style={styles.grabHandle} />

          {nav.phase === 'routing' ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={activeProfile.routeColor} />
              <Text style={styles.loadingText}>正在為您規劃{activeProfile.label}路線...</Text>
            </View>
          ) : nav.phase === 'arrived' ? (
            <View style={styles.arrivedWrap}>
              <View style={styles.arrivedBadge}>
                <View style={styles.arrivedIconCircle}>
                  <Ionicons name="checkmark" size={24} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.arrivedTitle}>已抵達目的地</Text>
                  <Text style={styles.arrivedSub}>{nav.destination?.name || '目的地'}</Text>
                </View>
              </View>
              <TouchableOpacity activeOpacity={0.9} onPress={nav.clearRoute}>
                <LinearGradient colors={['#10B981', '#059669']} style={styles.primaryGradBtn}>
                  <Text style={styles.primaryBtnText}>完成導航</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          ) : nav.route ? (
            <>
              <View style={styles.routeHeader}>
                <View style={{ flex: 1 }}>
                  <View style={styles.etaRow}>
                    <Text style={styles.etaDuration}>{formatDurationZh(remainingSec)}</Text>
                    <Text style={styles.etaDot}>•</Text>
                    <Text style={styles.etaDistance}>{remainingDistKm.toFixed(1)} 公里</Text>
                  </View>
                  <Text style={styles.etaSub} numberOfLines={1}>
                    預計 {formatEtaTime(remainingSec)} 抵達 • {nav.destination?.name || '目的地'}
                  </Text>
                </View>

                {!isActiveNav && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {nav.destination && (
                      <TouchableOpacity
                        style={styles.closeSheetBtn}
                        onPress={() => nav.destination && nav.handleToggleFavorite(nav.destination)}
                      >
                        <Ionicons
                          name={isDestFavorite ? 'star' : 'star-outline'}
                          size={17}
                          color={isDestFavorite ? '#DB2777' : '#4B5563'}
                        />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.closeSheetBtn} onPress={nav.clearRoute}>
                      <Ionicons name="close" size={18} color="#4B5563" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {!isActiveNav && nav.route.warning && (
                <View style={styles.warningStrip}>
                  <Ionicons name="shield-checkmark-outline" size={15} color="#92400E" />
                  <Text style={styles.warningStripText}>{nav.route.warning}</Text>
                </View>
              )}

              {!isActiveNav && (nav.vehicleType === 'car' || nav.vehicleType === 'heavy_moto') && (
                <View style={styles.optionRow}>
                  {nav.vehicleType === 'car' && (
                    <TouchableOpacity
                      style={[styles.optChip, nav.avoidTolls && styles.optChipActive]}
                      onPress={() => handleToggleAvoidOption('tolls')}
                    >
                      <Text style={[styles.optChipText, nav.avoidTolls && styles.optChipTextActive]}>
                        避開收費站
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.optChip, nav.avoidHighways && styles.optChipActive]}
                    onPress={() => handleToggleAvoidOption('highways')}
                  >
                    <Text
                      style={[styles.optChipText, nav.avoidHighways && styles.optChipTextActive]}
                    >
                      {nav.vehicleType === 'heavy_moto' ? '避開快速道路' : '避開高速公路'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* 操作按鈕列 */}
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
                    <LinearGradient colors={['#8B5CF6', '#6D28D9']} style={styles.primaryGradBtn}>
                      <Ionicons name="train" size={16} color="#FFFFFF" />
                      <Text style={styles.primaryBtnText}>查捷運／公車班次</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              ) : isActiveNav ? (
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
                      {nav.phase === 'paused' ? '繼續導航' : '暫停'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{ flex: 1.25 }}
                    activeOpacity={0.9}
                    onPress={nav.stopNavigation}
                  >
                    <LinearGradient colors={['#EF4444', '#DC2626']} style={styles.primaryGradBtn}>
                      <Ionicons name="stop-circle" size={17} color="#FFFFFF" />
                      <Text style={styles.primaryBtnText}>結束導航</Text>
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
                      colors={[activeProfile.routeColor, activeProfile.routeCasingColor]}
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
                  {nav.route.maneuvers.map((m) => {
                    const isCurrentStep =
                      isActiveNav && nav.progress?.activeManeuverIndex === m.index;
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
                              isCurrentStep && { color: '#831843', fontWeight: '800' },
                            ]}
                          >
                            {m.instruction}
                          </Text>
                          <Text style={styles.maneuverMeta}>
                            {m.distanceKm > 0 ? `${m.distanceKm.toFixed(2)} km` : '路口節點'}
                            {m.durationSec > 0
                              ? ` • 約 ${Math.max(1, Math.round(m.durationSec / 60))} 分`
                              : ''}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}
            </>
          ) : (
            <View style={styles.idleHint}>
              <Text style={styles.idleTitle}>探索台灣 • 鍋巴導航</Text>
              <Text style={styles.idleDesc}>
                輸入地標、商店或完整門牌，或長按地圖任意位置即可規劃路線。
              </Text>
            </View>
          )}
        </LiquidGlassSurface>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F3F4F6' },
  map: { flex: 1 },
  topOverlay: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 32 : 8,
    left: 14,
    right: 14,
    gap: 10,
  },
  // Apple Maps 風格搜尋膠囊
  searchCapsule: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    paddingHorizontal: 8,
    gap: 8,
  },
  capsuleBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: '#111827',
    paddingVertical: 0,
  },
  capsuleClearBtn: {
    padding: 6,
  },
  chipScrollRow: {
    gap: 8,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  vehiclePillActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    shadowColor: '#831843',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.24,
    shadowRadius: 8,
    elevation: 5,
  },
  vehiclePillTextActive: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  vehiclePillGlass: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
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
  // 恢復中斷導航卡片
  recoverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  recoverTitle: { fontSize: 13, fontWeight: '800', color: '#831843' },
  recoverSub: { fontSize: 12, color: '#9D174D', marginTop: 1 },
  recoverBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#DB2777',
  },
  recoverBtnText: { fontSize: 12, fontWeight: '700', color: '#FFFFFF' },
  // 搜尋結果清單
  searchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  searchItemIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(219, 39, 119, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchItemTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  searchItemAddr: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  searchDistText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9D174D',
    fontVariant: ['tabular-nums'],
  },
  bannerError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bannerErrorText: { flex: 1, fontSize: 12, color: '#B91C1C', fontWeight: '600' },
  // 導航 Turn-by-Turn 深色液態玻璃看板
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
    shadowColor: '#EC4899',
    shadowOpacity: 0.4,
    shadowRadius: 10,
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
    color: 'rgba(255,255,255,0.92)',
    marginTop: 2,
  },
  thenStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(0,0,0,0.22)',
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
    backgroundColor: 'rgba(180, 83, 9, 0.85)',
  },
  rerouteStripText: { fontSize: 12, fontWeight: '700', color: '#FEF3C7' },
  hudMetaRow: {
    flexDirection: 'row',
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
  // 右側一體化玻璃控制島
  rightDockWrap: {
    position: 'absolute',
    right: 14,
    top: '33%',
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
    top: '30%',
  },
  // 左下角車速玻璃球
  speedWrap: {
    position: 'absolute',
    left: 16,
    bottom: Platform.OS === 'ios' ? 205 : 190,
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
    color: 'rgba(255,255,255,0.7)',
  },
  // 回到車頭視角
  recenterWrap: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: Platform.OS === 'ios' ? 210 : 195,
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
  // 車輛游標與地圖標記
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
    shadowColor: '#000',
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 4,
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
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 5,
    elevation: 5,
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
  // 底部 Liquid Glass 卡片
  bottomSheetOuter: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: Platform.OS === 'ios' ? 24 : 14,
  },
  bottomSheetInner: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 18,
  },
  grabHandle: {
    alignSelf: 'center',
    width: 38,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.16)',
    marginBottom: 12,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
  },
  loadingText: { fontSize: 14, fontWeight: '700', color: '#1F2937' },
  arrivedWrap: { gap: 14 },
  arrivedBadge: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  arrivedIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrivedTitle: { fontSize: 19, fontWeight: '800', color: '#065F46' },
  arrivedSub: { fontSize: 13, color: '#4B5563', marginTop: 2 },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  etaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 7 },
  etaDuration: {
    fontSize: 26,
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
    backgroundColor: 'rgba(254, 243, 199, 0.85)',
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
    maxHeight: 210,
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
    backgroundColor: 'rgba(219, 39, 119, 0.1)',
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
  idleHint: { gap: 3, paddingBottom: 2 },
  idleTitle: { fontSize: 16, fontWeight: '800', color: '#111827', letterSpacing: -0.2 },
  idleDesc: { fontSize: 13, color: '#6B7280', lineHeight: 18 },
});
