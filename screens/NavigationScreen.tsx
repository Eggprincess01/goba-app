import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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
import { Coordinate, SearchPlace } from '../navigation/types';
import { useNavigationState } from '../navigation/useNavigationState';
import {
  formatDurationZh,
  formatEtaTime,
  getManeuverIconName,
  searchDestinationPlaces,
} from '../navigation/valhalla';
import { TAIWAN_VEHICLE_PROFILES } from '../navigation/vehicleRestrictions';

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
  const [showManeuvers, setShowManeuvers] = useState(false);
  const [is3D, setIs3D] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(14.5);

  const currentMapStyle = MAP_STYLE_OPTIONS[styleIdx] || MAP_STYLE_OPTIONS[0];

  // 將內部跟隨模式對應到 MapLibre v11 TrackUserLocation
  const mapLibreTrackMode: TrackUserLocation | undefined = useMemo(() => {
    if (nav.followMode === 'follow') return 'default';
    if (nav.followMode === 'heading') return 'heading';
    if (nav.followMode === 'course') return 'course';
    return undefined;
  }, [nav.followMode]);

  // 將 Valhalla 解碼座標轉為 GeoJSON Feature
  const routeGeoJSON = useMemo<GeoJSON.FeatureCollection | null>(() => {
    if (!nav.route || nav.route.coordinates.length < 2) return null;
    return {
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
    };
  }, [nav.route]);

  // 路線規劃完成後自動縮放視角涵蓋整條路線
  useEffect(() => {
    if (nav.route && nav.phase === 'route_preview') {
      const [west, south, east, north] = nav.route.bbox;
      nav.setFollowMode('free');
      setTimeout(() => {
        cameraRef.current?.fitBounds([west, south, east, north], {
          padding: { top: 170, right: 48, bottom: 280, left: 48 },
          duration: 750,
        });
      }, 120);
    }
  }, [nav.route?.fetchedAt]);

  // 進入定位跟隨預覽時切至導航視角
  useEffect(() => {
    if (nav.phase === 'navigating' && nav.gps) {
      setIs3D(true);
      cameraRef.current?.easeTo({
        center: [nav.gps.lon, nav.gps.lat],
        zoom: 16.5,
        pitch: 45,
        bearing: nav.gps.headingDeg && nav.gps.headingDeg >= 0 ? nav.gps.headingDeg : 0,
        duration: 600,
      });
    }
  }, [nav.phase]);

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
      const lngLat = event?.nativeEvent?.lngLat;
      if (!Array.isArray(lngLat) || lngLat.length < 2) return;
      const [lon, lat] = lngLat;
      const droppedPlace: SearchPlace = {
        id: `pin-${lat.toFixed(5)}-${lon.toFixed(5)}`,
        name: '地圖自訂標記點',
        address: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
        lat,
        lon,
        category: 'pin',
      };
      setSearchResults([]);
      setSearchQuery(droppedPlace.name);
      await nav.calculateRoute(droppedPlace);
    },
    [nav]
  );

  const handleCycleFollowMode = useCallback(() => {
    const order: Array<'follow' | 'heading' | 'course'> = ['follow', 'heading', 'course'];
    const idx = order.indexOf(nav.followMode as any);
    const next = order[(idx + 1) % order.length];
    nav.setFollowMode(next);
    if (nav.gps) {
      cameraRef.current?.easeTo({
        center: [nav.gps.lon, nav.gps.lat],
        zoom: Math.max(zoomLevel, 15.5),
        pitch: next === 'course' ? 45 : is3D ? 45 : 0,
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
      pitch: next3D ? 48 : 0,
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

  const followLabel =
    nav.followMode === 'course'
      ? '行進旋轉'
      : nav.followMode === 'heading'
      ? '指北旋轉'
      : nav.followMode === 'follow'
      ? '定位跟隨'
      : '自由瀏覽';

  return (
    <View style={styles.root}>
      {/* MapLibre Native 向量地圖本體 */}
      <Map
        ref={mapRef}
        style={styles.map}
        mapStyle={currentMapStyle.url}
        touchRotate
        touchPitch
        touchZoom
        dragPan
        compass
        compassPosition={{ top: 180, left: 14 }}
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

        {nav.gpsPermission === 'granted' && <UserLocation animated accuracy heading />}

        {/* 汽車路線繪製（外框 + 主線） */}
        {routeGeoJSON && (
          <GeoJSONSource id="goba-route-source" data={routeGeoJSON}>
            <Layer
              id="goba-route-casing"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': '#9D174D',
                'line-width': 10,
                'line-opacity': 0.85,
              }}
            />
            <Layer
              id="goba-route-line"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': '#EC4899',
                'line-width': 6,
                'line-opacity': 1,
              }}
            />
          </GeoJSONSource>
        )}

        {/* 目的地標記 */}
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

      {/* 頂部搜尋與車種列 */}
      <SafeAreaView style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.backBtn} onPress={onClose} activeOpacity={0.85}>
            <Ionicons name="chevron-back" size={22} color="#831843" />
          </TouchableOpacity>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#9D174D" />
            <TextInput
              style={styles.searchInput}
              placeholder="搜尋目的地（或長按地圖設標記）"
              placeholderTextColor="#9CA3AF"
              value={searchQuery}
              onChangeText={setSearchQuery}
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

          <TouchableOpacity style={styles.searchActionBtn} onPress={handleSearchSubmit} activeOpacity={0.85}>
            <Text style={styles.searchActionText}>搜尋</Text>
          </TouchableOpacity>
        </View>

        {/* 車種列（第一階段僅開放汽車，機車/重機明確標示驗證中） */}
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
                  active && styles.vehicleChipActive,
                  !v.isProductionVerified && styles.vehicleChipLocked,
                ]}
                activeOpacity={0.85}
                onPress={() => {
                  if (!v.isProductionVerified) {
                    Alert.alert(
                      `${v.label} — 第二階段開放`,
                      `${v.verificationNote}\n\n為避免導航誤導上國道、快速道路或禁行機車路段，第一階段僅開放「汽車」模式。`
                    );
                    return;
                  }
                  nav.setVehicleType(v.id);
                }}
              >
                <Ionicons
                  name={v.isProductionVerified ? 'car-sport' : 'lock-closed'}
                  size={13}
                  color={active ? '#FFFFFF' : v.isProductionVerified ? '#831843' : '#6B7280'}
                />
                <Text
                  style={[
                    styles.vehicleChipText,
                    active && styles.vehicleChipTextActive,
                    !v.isProductionVerified && styles.vehicleChipTextLocked,
                  ]}
                >
                  {v.shortLabel}
                  {!v.isProductionVerified ? ' (驗證中)' : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* 搜尋結果下拉清單 */}
        {searchResults.length > 0 && (
          <View style={styles.searchDropdown}>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 240 }}>
              {searchResults.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  style={styles.searchItem}
                  onPress={() => handleSelectPlace(p)}
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
                  <Ionicons name="arrow-forward-circle-outline" size={20} color="#DB2777" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* 錯誤或 GPS 權限提示 */}
        {(nav.errorMessage || nav.gpsPermission === 'denied') && (
          <View style={styles.bannerError}>
            <Ionicons name="alert-circle" size={16} color="#B91C1C" />
            <Text style={styles.bannerErrorText}>
              {nav.errorMessage || '尚未取得 GPS 定位權限，目前使用預設區域座標規劃路線。'}
            </Text>
          </View>
        )}

        {/* 定位測試資訊膠囊（方便 iOS/Android 實機定位驗證） */}
        <View style={styles.telemetryPill}>
          <Ionicons
            name={nav.gps ? 'radio-button-on' : 'radio-button-off'}
            size={12}
            color={nav.gps ? '#10B981' : '#F59E0B'}
          />
          <Text style={styles.telemetryText}>
            {nav.gps
              ? `GPS ${nav.gps.lat.toFixed(4)}, ${nav.gps.lon.toFixed(4)} • ±${Math.round(
                  nav.gps.accuracyMeters ?? 0
                )}m • ${followLabel}`
              : '正在取得 GPS 訊號...'}
            {nav.offRouteDistanceMeters !== null ? ` • 距路線 ${nav.offRouteDistanceMeters}m` : ''}
          </Text>
        </View>
      </SafeAreaView>

      {/* 右側地圖控制按鈕（跟隨/旋轉/3D/縮放/圖層） */}
      <View style={styles.rightControls}>
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

      {/* 底部路線資訊卡片 */}
      <View style={styles.bottomSheet}>
        {nav.phase === 'routing' ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#DB2777" />
            <Text style={styles.loadingText}>Valhalla 正在計算汽車路線...</Text>
          </View>
        ) : nav.route ? (
          <>
            <View style={styles.routeHeader}>
              <View style={{ flex: 1 }}>
                <View style={styles.etaRow}>
                  <Text style={styles.etaDuration}>{formatDurationZh(nav.route.durationSec)}</Text>
                  <Text style={styles.etaDistance}>• {nav.route.distanceKm.toFixed(1)} 公里</Text>
                </View>
                <Text style={styles.etaSub}>
                  預計 {formatEtaTime(nav.route.durationSec)} 抵達 • {nav.destination?.name || '目的地'}
                </Text>
              </View>

              <TouchableOpacity style={styles.clearBtn} onPress={nav.clearRoute}>
                <Ionicons name="close" size={18} color="#831843" />
              </TouchableOpacity>
            </View>

            {/* 避開選項 + Phase 1 狀態標註 */}
            <View style={styles.optionRow}>
              <TouchableOpacity
                style={[styles.optChip, nav.avoidTolls && styles.optChipActive]}
                onPress={() => handleToggleAvoidOption('tolls')}
              >
                <Text style={[styles.optChipText, nav.avoidTolls && styles.optChipTextActive]}>
                  避開收費站
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optChip, nav.avoidHighways && styles.optChipActive]}
                onPress={() => handleToggleAvoidOption('highways')}
              >
                <Text style={[styles.optChipText, nav.avoidHighways && styles.optChipTextActive]}>
                  避開高速公路
                </Text>
              </TouchableOpacity>
              <View style={styles.phaseBadge}>
                <Text style={styles.phaseBadgeText}>Phase 1 測試版</Text>
              </View>
            </View>

            {/* 主要操作按鈕 */}
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
                  轉彎清單 ({nav.route.maneuvers.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  nav.phase === 'navigating' && { backgroundColor: '#DC2626' },
                ]}
                onPress={
                  nav.phase === 'navigating'
                    ? nav.stopNavigationPreview
                    : nav.startNavigationPreview
                }
              >
                <Ionicons
                  name={nav.phase === 'navigating' ? 'stop-circle' : 'navigate'}
                  size={16}
                  color="#FFFFFF"
                />
                <Text style={styles.primaryBtnText}>
                  {nav.phase === 'navigating' ? '結束跟隨預覽' : '定位跟隨預覽'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* 展開的轉彎清單 */}
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
                        size={16}
                        color="#DB2777"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.maneuverTitle}>{m.instruction}</Text>
                      <Text style={styles.maneuverMeta}>
                        {m.distanceKm > 0 ? `${m.distanceKm.toFixed(2)} km` : '路口節點'}
                        {m.durationSec > 0 ? ` • 約 ${Math.max(1, Math.round(m.durationSec / 60))} 分` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </>
        ) : (
          <View style={styles.idleHint}>
            <View style={styles.idleTitleRow}>
              <Ionicons name="map" size={18} color="#DB2777" />
              <Text style={styles.idleTitle}>鍋巴地圖 GOBA Maps（第一階段測試版）</Text>
            </View>
            <Text style={styles.idleDesc}>
              輸入目的地搜尋或「長按地圖任意位置」即可透過 Valhalla 規劃汽車路線。目前支援 OpenStreetMap 向量圖磚、GPS 即時跟隨與轉彎預覽（語音與偏航重算將於第二階段啟用）。
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
  telemetryPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(17,24,39,0.78)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  telemetryText: { fontSize: 11, color: '#F9FAFB', fontWeight: '600' },
  rightControls: {
    position: 'absolute',
    right: 12,
    top: '36%',
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
  ctrlBtnActive: { backgroundColor: '#DB2777' },
  ctrlBtnText: { fontSize: 12, fontWeight: '800', color: '#831843' },
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
  phaseBadge: {
    marginLeft: 'auto',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#FEF3C7',
  },
  phaseBadgeText: { fontSize: 10, fontWeight: '700', color: '#92400E' },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FCE7F3',
  },
  secondaryBtnText: { fontSize: 13, fontWeight: '700', color: '#831843' },
  primaryBtn: {
    flex: 1.2,
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
    maxHeight: 210,
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F9FAFB',
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
