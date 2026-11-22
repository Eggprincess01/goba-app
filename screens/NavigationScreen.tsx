import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { MAP_STYLE_OPTIONS } from '../navigation/mapStyle';
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
import { getVehicleProfile, TAIWAN_VEHICLE_PROFILES } from '../navigation/vehicleRestrictions';

const QUICK_POI_CATEGORIES = [
  { label: '加油站', query: '加油站', icon: 'flame' },
  { label: '停車場', query: '停車場', icon: 'car' },
  { label: '便利商店', query: '7-ELEVEN', icon: 'storefront' },
  { label: '美食', query: '餐廳', icon: 'restaurant' },
  { label: '捷運站', query: '捷運站', icon: 'train' },
  { label: '醫院', query: '醫院', icon: 'medkit' },
];

const COCKPIT_CAMERA_PADDING = { top: 260, right: 0, bottom: 30, left: 0 };

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
  const [is3D, setIs3D] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(14.5);

  const lastCameraPushRef = useRef(0);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentMapStyle = MAP_STYLE_OPTIONS[styleIdx] || MAP_STYLE_OPTIONS[0];
  const isActiveNav = nav.phase === 'navigating' || nav.phase === 'off_route_recalculating';
  const activeProfile = getVehicleProfile(nav.vehicleType);

  // 導航中由高頻平滑引擎直接控制 3D 車輛視角；非導航中交由 MapLibre 原生跟隨
  const mapLibreTrackMode: TrackUserLocation | undefined = useMemo(() => {
    if (isActiveNav || nav.isSimulating) return undefined;
    if (nav.followMode === 'follow') return 'default';
    if (nav.followMode === 'heading') return 'heading';
    if (nav.followMode === 'course') return 'course';
    return undefined;
  }, [nav.followMode, nav.isSimulating, isActiveNav]);

  // 路線 GeoJSON：導航中拆分為「已行駛（灰化）」與「前方剩餘（高亮）」
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
                  { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: passed } },
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
      setTimeout(() => {
        cameraRef.current?.fitBounds([west, south, east, north], {
          padding: { top: 170, right: 48, bottom: 290, left: 48 },
          pitch: 0,
          bearing: 0,
          duration: 700,
        });
      }, 120);
    }
  }, [nav.route?.fetchedAt, nav.phase]);

  // Google Maps 風格 3D 車輛座艙視角（64° 高傾角 + 下方 1/3 焦點偏移 + 線性滑順跟隨）
  const vehicleDisplayCoord: [number, number] | null = useMemo(() => {
    if (!nav.gps) return null;
    if (isActiveNav && nav.progress?.snappedCoord && !nav.isSimulating) {
      return nav.progress.snappedCoord;
    }
    return [nav.gps.lon, nav.gps.lat];
  }, [nav.gps?.lat, nav.gps?.lon, isActiveNav, nav.isSimulating, nav.progress?.snappedCoord]);

  useEffect(() => {
    if (!isActiveNav || nav.followMode !== 'course' || !vehicleDisplayCoord || !nav.gps) return;
    const now = Date.now();
    // 節流至 ~140ms 搭配 easing: 'linear'，消除傳統 ease-in-out 的一頓一頓感
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
  }, [isActiveNav, nav.followMode, vehicleDisplayCoord?.[0], vehicleDisplayCoord?.[1], nav.gps?.headingDeg]);

  // 輸入時自動即時聯想搜尋（350ms 防抖）
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
      setSearchQuery(place.name);
      setShowManeuvers(false);
      await nav.calculateRoute(place);
    },
    [nav]
  );

  const handleLongPressMap = useCallback(
    async (event: any) => {
      if (isActiveNav) return;
      const lngLat = event?.nativeEvent?.lngLat;
      if (!Array.isArray(lngLat) || lngLat.length < 2) return;
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
    [nav, isActiveNav]
  );

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
        pitch: next === 'course' ? 50 : is3D ? 45 : 0,
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
      pitch: next3D ? 50 : 0,
      duration: 400,
    });
  }, [is3D, nav.effectiveOrigin]);

  const handleResetNorth = useCallback(async () => {
    const center = (await mapRef.current?.getCenter().catch(() => null)) || [
      nav.effectiveOrigin.lon,
      nav.effectiveOrigin.lat,
    ];
    cameraRef.current?.easeTo({
      center,
      bearing: 0,
      pitch: 0,
      duration: 350,
    });
    setIs3D(false);
  }, [nav.effectiveOrigin]);

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
        compassPosition={{ top: isActiveNav ? 190 : 180, left: 14 }}
        attributionPosition={{ bottom: 8, left: 8 }}
        onLongPress={handleLongPressMap}
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

        {/* 已行駛路線（淡灰） */}
        {passedGeoJSON && (
          <GeoJSONSource id="goba-route-passed-source" data={passedGeoJSON}>
            <Layer
              id="goba-route-passed-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': '#9CA3AF',
                'line-width': 7,
                'line-opacity': 0.75,
              }}
            />
          </GeoJSONSource>
        )}

        {/* 前方剩餘路線（依運具自動配色：外框 + 高亮主線） */}
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

        {/* 導航中 3D 車輛指向游標（Google Maps 風格箭頭） */}
        {isActiveNav && vehicleDisplayCoord && (
          <Marker id="goba-vehicle-puck" lngLat={vehicleDisplayCoord} anchor="center">
            <View style={styles.vehiclePuckHalo}>
              <View style={[styles.vehiclePuckCore, { borderColor: activeProfile.routeColor }]}>
                <Ionicons name="navigate" size={20} color={activeProfile.routeColor} style={{ transform: [{ rotate: '-45deg' }] }} />
              </View>
            </View>
          </Marker>
        )}

        {/* 附近快速搜尋 POI 標記（點擊即可規劃路線） */}
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
              <View style={styles.destMarkerBadge}>
                <Ionicons name="flag" size={16} color="#FFFFFF" />
              </View>
              <View style={styles.destMarkerTip} />
            </View>
          </Marker>
        )}
      </Map>

      {/* 頂部 HUD：導航中顯示 Turn-by-Turn 看板；否則顯示搜尋列 */}
      <SafeAreaView style={styles.topOverlay} pointerEvents="box-none">
        {isActiveNav ? (
          <View style={styles.navHudWrap}>
            <View style={styles.navHudMain}>
              <View style={styles.navHudArrowBox}>
                <Ionicons
                  name={
                    getManeuverIconName(
                      nav.progress?.nextManeuver?.type ?? nav.route?.maneuvers[0]?.type ?? 8
                    ) as any
                  }
                  size={34}
                  color="#FFFFFF"
                />
              </View>
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
                  size={15}
                  color="#FBCFE8"
                />
                <Text style={styles.thenText} numberOfLines={1}>
                  {nav.progress.thenManeuver.instruction}
                </Text>
              </View>
            ) : null}

            {/* 導航狀態徽章（模擬 / 背景定位 / 重算次數） */}
            <View style={styles.hudMetaRow}>
              {nav.isSimulating && (
                <View style={styles.hudChipAmber}>
                  <Text style={styles.hudChipAmberText}>模擬行駛測試中</Text>
                </View>
              )}
              {nav.bgLocationActive && (
                <View style={styles.hudChipGreen}>
                  <Text style={styles.hudChipGreenText}>背景定位已啟用</Text>
                </View>
              )}
              {nav.rerouteCount > 0 && (
                <View style={styles.hudChipDark}>
                  <Text style={styles.hudChipDarkText}>已重算 {nav.rerouteCount} 次</Text>
                </View>
              )}
            </View>
          </View>
        ) : (
          <>
            <View style={styles.topBar}>
              <TouchableOpacity style={styles.backBtn} onPress={onClose} activeOpacity={0.85}>
                <Ionicons name="chevron-back" size={22} color="#831843" />
              </TouchableOpacity>

              <View style={styles.searchBox}>
                <Ionicons name="search" size={18} color="#9D174D" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="搜尋地點、商店或門牌（如林口三井）"
                  placeholderTextColor="#9CA3AF"
                  value={searchQuery}
                  onChangeText={handleQueryChange}
                  returnKeyType="search"
                  onSubmitEditing={handleSearchSubmit}
                />
                {searching ? (
                  <ActivityIndicator size="small" color="#DB2777" />
                ) : searchQuery.length > 0 ? (
                  <TouchableOpacity
                    onPress={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                      nav.clearRoute();
                    }}
                  >
                    <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                  </TouchableOpacity>
                ) : null}
              </View>

              <TouchableOpacity
                style={styles.searchActionBtn}
                onPress={handleSearchSubmit}
                activeOpacity={0.85}
              >
                <Text style={styles.searchActionText}>搜尋</Text>
              </TouchableOpacity>
            </View>

            {/* 六大交通模式選擇列：汽車 / 重機 / 摩托車 / 腳踏車 / 步行 / 大眾交通 */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.vehicleRow}
            >
              {TAIWAN_VEHICLE_PROFILES.map((v) => {
                const active = nav.vehicleType === v.id;
                return (
                  <TouchableOpacity
                    key={v.id}
                    style={[
                      styles.vehicleChip,
                      active && { backgroundColor: v.routeColor, borderColor: v.routeColor },
                    ]}
                    activeOpacity={0.85}
                    onPress={() => nav.setVehicleType(v.id)}
                  >
                    <Ionicons
                      name={v.iconName as any}
                      size={14}
                      color={active ? '#FFFFFF' : '#831843'}
                    />
                    <Text
                      style={[
                        styles.vehicleChipText,
                        active && styles.vehicleChipTextActive,
                      ]}
                    >
                      {v.shortLabel}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 閒置時顯示快速附近景點探索列（加油站 / 停車場 / 便利商店 / 美食 / 捷運 / 醫院） */}
            {!nav.route && searchResults.length === 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.vehicleRow}
              >
                {QUICK_POI_CATEGORIES.map((cat) => {
                  const selected = activePoiCat === cat.label;
                  return (
                    <TouchableOpacity
                      key={cat.label}
                      style={[styles.poiCatChip, selected && styles.poiCatChipActive]}
                      onPress={() => handleQuickPoiCategory(cat.label, cat.query)}
                    >
                      <Ionicons
                        name={cat.icon as any}
                        size={13}
                        color={selected ? '#FFFFFF' : '#4B5563'}
                      />
                      <Text style={[styles.poiCatText, selected && { color: '#FFFFFF' }]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {searchResults.length > 0 && (
              <View style={styles.searchDropdown}>
                <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 260 }}>
                  {searchResults.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.searchItem}
                      onPress={() => {
                        setNearbyPins([]);
                        setActivePoiCat(null);
                        handleSelectPlace(p);
                      }}
                    >
                      <Ionicons name="location" size={18} color="#DB2777" />
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
                      <Ionicons name="arrow-forward-circle-outline" size={20} color="#DB2777" />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}

        {(nav.errorMessage || nav.gpsPermission === 'denied') && (
          <View style={styles.bannerError}>
            <Ionicons name="alert-circle" size={16} color="#B91C1C" />
            <Text style={styles.bannerErrorText}>
              {nav.errorMessage || '尚未取得 GPS 定位權限，目前使用預設區域座標規劃路線。'}
            </Text>
          </View>
        )}
      </SafeAreaView>

      {/* 右側地圖與語音控制列 */}
      <View style={styles.rightControls}>
        <TouchableOpacity
          style={[styles.ctrlBtn, !nav.voiceEnabled && styles.ctrlBtnMuted]}
          onPress={nav.toggleVoice}
          activeOpacity={0.85}
        >
          <Ionicons
            name={nav.voiceEnabled ? 'volume-high' : 'volume-mute'}
            size={20}
            color={nav.voiceEnabled ? '#831843' : '#6B7280'}
          />
        </TouchableOpacity>

        <TouchableOpacity style={styles.ctrlBtn} onPress={handleCycleFollowMode} activeOpacity={0.85}>
          <Ionicons name={followIconName as any} size={20} color="#831843" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.ctrlBtn} onPress={handleResetNorth} activeOpacity={0.85}>
          <Ionicons name="compass-outline" size={20} color="#831843" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ctrlBtn, is3D && styles.ctrlBtnActive]}
          onPress={handleToggle3D}
          activeOpacity={0.85}
        >
          <Text style={[styles.ctrlBtnText, is3D && { color: '#FFFFFF' }]}>{is3D ? '3D' : '2D'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.ctrlBtn} onPress={() => handleZoom(1)} activeOpacity={0.85}>
          <Ionicons name="add" size={22} color="#831843" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.ctrlBtn} onPress={() => handleZoom(-1)} activeOpacity={0.85}>
          <Ionicons name="remove" size={22} color="#831843" />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.ctrlBtn}
          onPress={() => setStyleIdx((prev) => (prev + 1) % MAP_STYLE_OPTIONS.length)}
          activeOpacity={0.85}
        >
          <Ionicons name="layers-outline" size={19} color="#831843" />
        </TouchableOpacity>
      </View>

      {/* 導航中左下角即時車速表 */}
      {isActiveNav && (
        <View style={styles.speedPill}>
          <Text style={styles.speedValue}>{nav.speedKmh}</Text>
          <Text style={styles.speedUnit}>km/h</Text>
        </View>
      )}

      {/* 導航中若手動拖曳地圖，顯示「回到車頭視角」浮動按鈕 */}
      {isActiveNav && nav.followMode !== 'course' && (
        <TouchableOpacity
          style={styles.recenterCockpitBtn}
          onPress={handleRecenterCockpit}
          activeOpacity={0.9}
        >
          <Ionicons name="navigate" size={16} color="#FFFFFF" />
          <Text style={styles.recenterCockpitText}>回到車頭視角</Text>
        </TouchableOpacity>
      )}

      {/* 底部資訊卡片 */}
      <View style={styles.bottomSheet}>
        {nav.phase === 'routing' ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={activeProfile.routeColor} />
            <Text style={styles.loadingText}>
              Valhalla 正在計算{activeProfile.label}路線...
            </Text>
          </View>
        ) : nav.phase === 'arrived' ? (
          <View style={styles.arrivedWrap}>
            <View style={styles.arrivedBadge}>
              <Ionicons name="checkmark-circle" size={28} color="#10B981" />
              <View style={{ flex: 1 }}>
                <Text style={styles.arrivedTitle}>已抵達目的地</Text>
                <Text style={styles.arrivedSub}>{nav.destination?.name || '目的地'}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={nav.clearRoute}>
              <Text style={styles.primaryBtnText}>完成導航</Text>
            </TouchableOpacity>
          </View>
        ) : nav.route ? (
          <>
            <View style={styles.routeHeader}>
              <View style={{ flex: 1 }}>
                <View style={styles.etaRow}>
                  <Text style={styles.etaDuration}>{formatDurationZh(remainingSec)}</Text>
                  <Text style={styles.etaDistance}>• {remainingDistKm.toFixed(1)} 公里</Text>
                </View>
                <Text style={styles.etaSub}>
                  預計 {formatEtaTime(remainingSec)} 抵達 • {nav.destination?.name || '目的地'}
                </Text>
              </View>

              {!isActiveNav && (
                <TouchableOpacity style={styles.clearBtn} onPress={nav.clearRoute}>
                  <Ionicons name="close" size={18} color="#831843" />
                </TouchableOpacity>
              )}
            </View>

            {!isActiveNav && nav.route.warning && (
              <View style={styles.warningStrip}>
                <Ionicons name="information-circle" size={15} color="#92400E" />
                <Text style={styles.warningStripText}>{nav.route.warning}</Text>
              </View>
            )}

            {!isActiveNav && (
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
                {(nav.vehicleType === 'car' || nav.vehicleType === 'heavy_moto') && (
                  <TouchableOpacity
                    style={[styles.optChip, nav.avoidHighways && styles.optChipActive]}
                    onPress={() => handleToggleAvoidOption('highways')}
                  >
                    <Text style={[styles.optChipText, nav.avoidHighways && styles.optChipTextActive]}>
                      {nav.vehicleType === 'heavy_moto' ? '避開快速道路' : '避開高速公路'}
                    </Text>
                  </TouchableOpacity>
                )}
                <View style={[styles.phaseBadge, { backgroundColor: `${activeProfile.routeColor}18` }]}>
                  <Text style={[styles.phaseBadgeText, { color: activeProfile.routeCasingColor }]}>
                    {activeProfile.label}模式
                  </Text>
                </View>
              </View>
            )}

            {/* 導航操作按鈕 */}
            {nav.route.transitPending ? (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => setShowManeuvers((v) => !v)}
                >
                  <Ionicons name="walk" size={16} color="#831843" />
                  <Text style={styles.secondaryBtnText}>步行參考路線</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: '#7C3AED' }]}
                  onPress={() => {
                    if (nav.destination) {
                      const url = `maps://?daddr=${nav.destination.lat},${nav.destination.lon}&dirflg=r`;
                      Linking.openURL(url).catch(() => {});
                    }
                  }}
                >
                  <Ionicons name="train" size={16} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>查捷運／公車班次</Text>
                </TouchableOpacity>
              </View>
            ) : isActiveNav ? (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => setShowManeuvers((v) => !v)}
                >
                  <Ionicons
                    name={showManeuvers ? 'chevron-down' : 'list'}
                    size={16}
                    color="#831843"
                  />
                  <Text style={styles.secondaryBtnText}>
                    剩餘步驟 ({nav.route.maneuvers.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: '#DC2626' }]}
                  onPress={nav.stopNavigation}
                >
                  <Ionicons name="stop-circle" size={16} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>結束導航</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.iconActionBtn}
                  onPress={() => setShowManeuvers((v) => !v)}
                >
                  <Ionicons name="list" size={18} color="#831843" />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={nav.startSimulatedNavigation}
                >
                  <Ionicons name="play-circle" size={16} color="#831843" />
                  <Text style={styles.secondaryBtnText}>模擬導航</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.primaryBtn} onPress={nav.startNavigation}>
                  <Ionicons name="navigate" size={16} color="#FFFFFF" />
                  <Text style={styles.primaryBtnText}>開始語音導航</Text>
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
                          isCurrentStep && { backgroundColor: '#DB2777' },
                        ]}
                      >
                        <Ionicons
                          name={getManeuverIconName(m.type) as any}
                          size={16}
                          color={isCurrentStep ? '#FFFFFF' : '#DB2777'}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.maneuverTitle,
                            isCurrentStep && { color: '#831843' },
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
            <View style={styles.idleTitleRow}>
              <Ionicons name="navigate-circle" size={19} color="#DB2777" />
              <Text style={styles.idleTitle}>鍋巴地圖 GOBA Maps（Phase 2 即時語音導航）</Text>
            </View>
            <Text style={styles.idleDesc}>
              搜尋目的地或長按地圖設標記，即可啟動汽車即時語音導航（支援繁中播報、偏航自動重算、螢幕恆亮、背景定位與室內模擬導航測試）。
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FDF2F8' },
  map: { flex: 1 },
  topOverlay: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 32 : 8,
    left: 12,
    right: 12,
    gap: 8,
  },
  // Phase 2 Turn-by-Turn HUD
  navHudWrap: {
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#4A0424',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 8,
  },
  navHudMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  navHudArrowBox: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: '#DB2777',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navHudDistance: {
    fontSize: 24,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  navHudInstruction: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FCE7F3',
    marginTop: 2,
  },
  thenStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  thenLabel: { fontSize: 11, fontWeight: '800', color: '#F9A8D4' },
  thenText: { flex: 1, fontSize: 12, fontWeight: '600', color: '#FFFFFF' },
  rerouteStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#B45309',
  },
  rerouteStripText: { fontSize: 12, fontWeight: '700', color: '#FEF3C7' },
  hudMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 8,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  hudChipAmber: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  hudChipAmberText: { fontSize: 10, fontWeight: '800', color: '#92400E' },
  hudChipGreen: {
    backgroundColor: '#D1FAE5',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  hudChipGreenText: { fontSize: 10, fontWeight: '800', color: '#065F46' },
  hudChipDark: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  hudChipDarkText: { fontSize: 10, fontWeight: '700', color: '#FFFFFF' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#1F2937',
    paddingVertical: 0,
  },
  searchActionBtn: {
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 21,
    backgroundColor: '#DB2777',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#DB2777',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  searchActionText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  vehicleRow: {
    gap: 8,
    paddingHorizontal: 2,
  },
  vehicleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 1,
    borderColor: '#FBCFE8',
  },
  vehicleChipActive: {
    backgroundColor: '#DB2777',
    borderColor: '#DB2777',
  },
  vehicleChipLocked: {
    backgroundColor: 'rgba(243,244,246,0.94)',
    borderColor: '#E5E7EB',
  },
  vehicleChipText: { fontSize: 12, fontWeight: '700', color: '#831843' },
  vehicleChipTextActive: { color: '#FFFFFF' },
  vehicleChipTextLocked: { color: '#6B7280', fontWeight: '600' },
  searchDropdown: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 6,
  },
  searchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F3F4F6',
  },
  searchItemTitle: { fontSize: 14, fontWeight: '700', color: '#1F2937' },
  searchItemAddr: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  bannerError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  bannerErrorText: { flex: 1, fontSize: 12, color: '#991B1B', fontWeight: '600' },
  rightControls: {
    position: 'absolute',
    right: 12,
    top: '34%',
    gap: 8,
  },
  ctrlBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 6,
    elevation: 4,
  },
  ctrlBtnMuted: { backgroundColor: 'rgba(243,244,246,0.95)' },
  ctrlBtnActive: { backgroundColor: '#DB2777' },
  ctrlBtnText: { fontSize: 12, fontWeight: '800', color: '#831843' },
  speedPill: {
    position: 'absolute',
    left: 14,
    bottom: Platform.OS === 'ios' ? 195 : 180,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(17,24,39,0.88)',
    borderWidth: 2,
    borderColor: '#EC4899',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  speedValue: { fontSize: 18, fontWeight: '900', color: '#FFFFFF', lineHeight: 20 },
  speedUnit: { fontSize: 9, fontWeight: '700', color: '#F9A8D4' },
  simCarPuck: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#2563EB',
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  vehiclePuckHalo: {
    width: 52,
    height: 52,
    borderRadius: 26,
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
  poiCatChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  poiCatChipActive: {
    backgroundColor: '#1F2937',
    borderColor: '#1F2937',
  },
  poiCatText: { fontSize: 11, fontWeight: '700', color: '#374151' },
  poiPinWrap: { alignItems: 'center', maxWidth: 110 },
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
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  poiPinLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: '700',
    color: '#1F2937',
    backgroundColor: 'rgba(255,255,255,0.92)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  searchDistText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9D174D',
  },
  recenterCockpitBtn: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: Platform.OS === 'ios' ? 200 : 185,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    backgroundColor: '#111827',
    borderWidth: 1.5,
    borderColor: '#EC4899',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  recenterCockpitText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  destMarkerWrap: { alignItems: 'center' },
  destMarkerBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#DB2777',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
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
  bottomSheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: Platform.OS === 'ios' ? 24 : 14,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 22,
    padding: 16,
    shadowColor: '#831843',
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 8,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
  },
  loadingText: { fontSize: 14, fontWeight: '700', color: '#831843' },
  arrivedWrap: { gap: 12 },
  arrivedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  arrivedTitle: { fontSize: 18, fontWeight: '900', color: '#065F46' },
  arrivedSub: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  routeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  etaRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  etaDuration: { fontSize: 22, fontWeight: '800', color: '#831843' },
  etaDistance: { fontSize: 14, fontWeight: '700', color: '#6B7280' },
  etaSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  clearBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FCE7F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  optChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#FDF2F8',
    borderWidth: 1,
    borderColor: '#FBCFE8',
  },
  optChipActive: { backgroundColor: '#DB2777', borderColor: '#DB2777' },
  optChipText: { fontSize: 11, fontWeight: '700', color: '#9D174D' },
  optChipTextActive: { color: '#FFFFFF' },
  warningStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  warningStripText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
    color: '#92400E',
  },
  phaseBadge: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#FCE7F3',
  },
  phaseBadgeText: { fontSize: 10, fontWeight: '700', color: '#9D174D' },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  iconActionBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FCE7F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FCE7F3',
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '700', color: '#831843' },
  primaryBtn: {
    flex: 1.35,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#DB2777',
  },
  primaryBtnText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  maneuverList: {
    maxHeight: 200,
    marginTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F3F4F6',
    paddingTop: 8,
  },
  maneuverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F9FAFB',
  },
  maneuverRowActive: {
    backgroundColor: '#FDF2F8',
  },
  maneuverIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FDF2F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  maneuverTitle: { fontSize: 13, fontWeight: '700', color: '#1F2937' },
  maneuverMeta: { fontSize: 11, color: '#6B7280', marginTop: 2 },
  idleHint: { gap: 4 },
  idleTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  idleTitle: { fontSize: 14, fontWeight: '800', color: '#831843' },
  idleDesc: { fontSize: 12, color: '#6B7280', lineHeight: 18 },
});
