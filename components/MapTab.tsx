import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import {
  Camera,
  type CameraRef,
  Map,
  Marker,
  UserLocation,
} from '@maplibre/maplibre-react-native';
import { styles } from '../styles/theme';
import { GAS_BRAND_FILTERS, MapCategory } from '../types';
import { LiveTrafficData, MapPOI, RegionInfo } from '../services/api';
import { getEffectiveMapStyleUrl } from '../navigation/mapStyle';
import { SearchPlace } from '../navigation/types';
import { NavigationScreen } from '../screens/NavigationScreen';

interface MapTabProps {
  cameraRef: React.RefObject<CameraRef | null>;
  region: RegionInfo;
  mapCategory: MapCategory;
  onChangeCategory: (cat: MapCategory) => void;
  gasBrandFilter: string;
  onChangeGasBrand: (brand: string) => void;
  mapPois: MapPOI[];
  mapLoading: boolean;
  mapError: string | null;
  selectedPoi: MapPOI | null;
  onSelectPoi: (poi: MapPOI) => void;
  onFocusPoi: (poi: MapPOI) => void;
  onRetryPois: () => void;
  trafficData: LiveTrafficData | null;
  trafficLoading: boolean;
  trafficError: string | null;
  trafficSubTab: 'speeds' | 'incidents';
  onChangeTrafficSubTab: (t: 'speeds' | 'incidents') => void;
  onRefreshTraffic: () => void;
  onOpenRegionModal: () => void;
}

export function MapTab({
  cameraRef,
  region,
  mapCategory,
  onChangeCategory,
  gasBrandFilter,
  onChangeGasBrand,
  mapPois,
  mapLoading,
  mapError,
  selectedPoi,
  onSelectPoi,
  onFocusPoi,
  onRetryPois,
  trafficData,
  trafficLoading,
  trafficError,
  trafficSubTab,
  onChangeTrafficSubTab,
  onRefreshTraffic,
  onOpenRegionModal,
}: MapTabProps) {
  const [navModalVisible, setNavModalVisible] = useState(false);
  const [navTargetPlace, setNavTargetPlace] = useState<SearchPlace | null>(null);
  const [useFallbackStyle, setUseFallbackStyle] = useState(false);

  const mapStyleUrl = useMemo(
    () => getEffectiveMapStyleUrl(0, false, useFallbackStyle),
    [useFallbackStyle]
  );

  const openGobaNavigation = (poi?: MapPOI) => {
    if (poi) {
      setNavTargetPlace({
        id: poi.id,
        name: poi.name,
        address: poi.address || poi.brand || '',
        lat: poi.lat,
        lon: poi.lon,
        category:
          poi.category === 'gas'
            ? '加油站'
            : poi.category === 'parking'
            ? '停車場'
            : poi.category === 'dmv'
            ? '監理站'
            : '地點',
        distanceKm: poi.distanceKm,
      });
    } else {
      setNavTargetPlace(null);
    }
    setNavModalVisible(true);
  };

  const closeGobaNavigation = () => {
    setNavModalVisible(false);
    setNavTargetPlace(null);
  };

  const visiblePois = (
    mapCategory === 'gas' && gasBrandFilter !== '全部'
      ? mapPois.filter((p) => p.brand === gasBrandFilter)
      : mapPois
  ).filter((p) => p.category === mapCategory);

  const activeError = mapCategory === 'traffic' ? trafficError : mapError;

  return (
    <View style={styles.mapTabContainer}>
      {/* GOBA Maps 全螢幕導航入口卡片 */}
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={() => openGobaNavigation()}
        style={{
          marginHorizontal: 16,
          marginBottom: 8,
          paddingHorizontal: 14,
          paddingVertical: 11,
          borderRadius: 16,
          backgroundColor: '#DB2777',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          shadowColor: '#DB2777',
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 4,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: 'rgba(255,255,255,0.2)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="navigate" size={18} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '800' }}>
              開啟鍋巴地圖導航（iOS 語音即時導航）
            </Text>
            <Text style={{ color: 'rgba(255,255,255,0.88)', fontSize: 11, marginTop: 1 }}>
              GOBA Maps 自建向量地圖 • 繁中語音指引 • 偏航自動重算
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#FFFFFF" />
      </TouchableOpacity>

      <Modal
        visible={navModalVisible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={closeGobaNavigation}
      >
        <NavigationScreen
          initialCenter={{ lat: region.lat, lon: region.lon }}
          initialDestination={navTargetPlace}
          onClose={closeGobaNavigation}
        />
      </Modal>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 44 }}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: 'center' }}
      >
        {[
          { key: 'gas', label: '⛽ 加油站' },
          { key: 'parking', label: '🅿️ 停車場' },
          { key: 'traffic', label: '🚦 即時路況' },
          { key: 'dmv', label: '🏢 監理站' },
        ].map((item) => {
          const active = mapCategory === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.mapFilterPill, active && styles.mapFilterPillActive]}
              onPress={() => onChangeCategory(item.key as MapCategory)}
            >
              <Text style={[styles.mapFilterText, active && styles.mapFilterTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {mapCategory === 'gas' && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ maxHeight: 38, marginTop: 6 }}
          contentContainerStyle={{ paddingHorizontal: 16, gap: 6, alignItems: 'center' }}
        >
          {GAS_BRAND_FILTERS.map((brand) => {
            const active = gasBrandFilter === brand;
            return (
              <TouchableOpacity
                key={brand}
                style={[styles.brandChip, active && styles.brandChipActive]}
                onPress={() => onChangeGasBrand(brand)}
              >
                <Text style={[styles.brandChipText, active && styles.brandChipTextActive]}>{brand}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}

      {mapCategory === 'traffic' && (
        <View style={styles.trafficSubTabRow}>
          <TouchableOpacity
            style={[styles.trafficSubBtn, trafficSubTab === 'speeds' && styles.trafficSubBtnActive]}
            onPress={() => onChangeTrafficSubTab('speeds')}
          >
            <Text style={[styles.trafficSubText, trafficSubTab === 'speeds' && { color: '#FFF' }]}>
              ⚡ 國道即時車速 ({trafficData?.speeds.length || 0})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.trafficSubBtn, trafficSubTab === 'incidents' && styles.trafficSubBtnActive]}
            onPress={() => onChangeTrafficSubTab('incidents')}
          >
            <Text style={[styles.trafficSubText, trafficSubTab === 'incidents' && { color: '#FFF' }]}>
              ⚠️ 1968 即時事件 ({trafficData?.incidents.length || 0})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.trafficRefreshIcon} onPress={onRefreshTraffic}>
            <Ionicons name="refresh" size={16} color="#9D174D" />
          </TouchableOpacity>
        </View>
      )}

      <View style={[styles.mapFrame, mapCategory === 'traffic' && { height: 195 }]}>
        <Map
          style={StyleSheet.absoluteFill}
          mapStyle={mapStyleUrl}
          logo={false}
          attribution={false}
          compass={false}
          onDidFailLoadingMap={() => setUseFallbackStyle(true)}
        >
          <Camera
            ref={cameraRef}
            initialViewState={{
              center: [region.lon, region.lat],
              zoom: 13.5,
            }}
          />
          <UserLocation />

          {mapCategory !== 'traffic' &&
            visiblePois.slice(0, 35).map((poi) => {
              const isSel = selectedPoi?.id === poi.id;
              const pinBg = isSel ? '#DB2777' : poi.brandColor || '#EC4899';
              return (
                <Marker
                  key={poi.id}
                  id={`maptab-poi-${poi.id}`}
                  lngLat={[poi.lon, poi.lat]}
                  anchor="bottom"
                  onPress={() => onSelectPoi(poi)}
                >
                  <View style={{ alignItems: 'center' }}>
                    {isSel && (
                      <View
                        style={{
                          backgroundColor: '#FFFFFF',
                          paddingHorizontal: 8,
                          paddingVertical: 3,
                          borderRadius: 10,
                          marginBottom: 3,
                          borderWidth: 1,
                          borderColor: '#FBCFE8',
                          shadowColor: '#000',
                          shadowOpacity: 0.14,
                          shadowRadius: 4,
                          elevation: 3,
                          maxWidth: 150,
                        }}
                      >
                        <Text
                          style={{ fontSize: 11, fontWeight: '700', color: '#831843' }}
                          numberOfLines={1}
                        >
                          {poi.name}
                        </Text>
                      </View>
                    )}
                    <View
                      style={{
                        width: isSel ? 30 : 24,
                        height: isSel ? 30 : 24,
                        borderRadius: isSel ? 15 : 12,
                        backgroundColor: pinBg,
                        borderWidth: 2,
                        borderColor: '#FFFFFF',
                        alignItems: 'center',
                        justifyContent: 'center',
                        shadowColor: '#000',
                        shadowOpacity: 0.22,
                        shadowRadius: 4,
                        elevation: 4,
                      }}
                    >
                      <Ionicons
                        name={
                          poi.category === 'gas'
                            ? 'flame'
                            : poi.category === 'parking'
                            ? 'car'
                            : 'business'
                        }
                        size={isSel ? 15 : 12}
                        color="#FFFFFF"
                      />
                    </View>
                  </View>
                </Marker>
              );
            })}

          {mapCategory === 'traffic' &&
            (trafficData?.incidents || [])
              .filter((inc) => inc.lat && inc.lon)
              .slice(0, 25)
              .map((inc) => (
                <Marker
                  key={inc.id}
                  id={`maptab-inc-${inc.id}`}
                  lngLat={[inc.lon!, inc.lat!]}
                  anchor="center"
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 12,
                      backgroundColor: '#DC2626',
                      borderWidth: 2,
                      borderColor: '#FFFFFF',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="warning" size={12} color="#FFFFFF" />
                  </View>
                </Marker>
              ))}
        </Map>

        <TouchableOpacity style={styles.mapRegionFloatBtn} onPress={onOpenRegionModal}>
          <Ionicons name="location" size={13} color="#DB2777" />
          <Text style={styles.mapRegionFloatText}>{region.name}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => openGobaNavigation()}
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            backgroundColor: 'rgba(255,255,255,0.92)',
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: '#FBCFE8',
          }}
        >
          <Ionicons name="expand-outline" size={13} color="#DB2777" />
          <Text style={{ fontSize: 11, fontWeight: '700', color: '#831843' }}>全螢幕</Text>
        </TouchableOpacity>

        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            bottom: 8,
            left: 10,
            backgroundColor: 'rgba(255,255,255,0.86)',
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 8,
          }}
        >
          <Text style={{ fontSize: 10, fontWeight: '800', color: '#DB2777' }}>GOBA Maps</Text>
        </View>
      </View>

      <View style={styles.mapListWrap}>
        {activeError ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorBannerText}>⚠️ {activeError}</Text>
            <TouchableOpacity
              style={styles.errorRetryBtn}
              onPress={mapCategory === 'traffic' ? onRefreshTraffic : onRetryPois}
            >
              <Text style={styles.errorRetryText}>重試</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {mapCategory === 'traffic' ? (
          trafficLoading && !trafficData ? (
            <View style={{ paddingVertical: 24, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#EC4899" />
              <Text style={{ fontSize: 12, color: '#9D174D', marginTop: 6 }}>
                正在抓取高公局 1968 官方即時路況...
              </Text>
            </View>
          ) : (
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 110, gap: 8 }}
            >
              <Text style={{ fontSize: 11, color: '#9D174D', fontWeight: '600', marginBottom: 2 }}>
                資料來源：{trafficData?.source || '高公局 1968'} • 更新 {trafficData?.updated_at || '--:--'}
              </Text>

              {trafficSubTab === 'speeds' ? (
                (trafficData?.speeds || []).length === 0 ? (
                  <Text style={styles.emptyText}>暫無國道車速回報資料</Text>
                ) : (
                  (trafficData?.speeds || []).map((sp) => (
                    <BlurView key={sp.id} intensity={68} tint="light" style={styles.poiRowCard}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.poiNameText}>{sp.section}</Text>
                        <Text style={styles.poiAddrText}>{sp.road}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontSize: 16, fontWeight: '900', color: sp.color }}>
                          {sp.speed} km/h
                        </Text>
                        <View style={[styles.poiBrandPill, { backgroundColor: `${sp.color}18`, marginTop: 2 }]}>
                          <Text style={[styles.poiBrandText, { color: sp.color }]}>{sp.status}</Text>
                        </View>
                      </View>
                    </BlurView>
                  ))
                )
              ) : (trafficData?.incidents || []).length === 0 ? (
                <Text style={styles.emptyText}>目前全台國道無通報事件 🟢</Text>
              ) : (
                (trafficData?.incidents || []).map((inc) => (
                  <BlurView key={inc.id} intensity={68} tint="light" style={styles.poiRowCard}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <View style={[styles.poiBrandPill, { backgroundColor: '#FEE2E2' }]}>
                          <Text style={[styles.poiBrandText, { color: '#DC2626' }]}>{inc.type}</Text>
                        </View>
                        <Text style={styles.poiDistText}>{inc.time}</Text>
                      </View>
                      <Text style={styles.poiNameText}>{inc.title}</Text>
                      <Text style={styles.poiAddrText}>{inc.detail}</Text>
                    </View>
                  </BlurView>
                ))
              )}
            </ScrollView>
          )
        ) : mapLoading && visiblePois.length === 0 ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <ActivityIndicator size="small" color="#EC4899" />
            <Text style={{ fontSize: 12, color: '#9D174D', marginTop: 6 }}>
              正在載入 {region.name} 周邊站點...
            </Text>
          </View>
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 110, gap: 8 }}
          >
            {visiblePois.length === 0 ? (
              <Text style={styles.emptyText}>此篩選條件下暫無站點，可切換「全部」或更換地區</Text>
            ) : (
              visiblePois.map((poi) => {
                const isSel = selectedPoi?.id === poi.id;
                return (
                  <TouchableOpacity key={poi.id} activeOpacity={0.82} onPress={() => onFocusPoi(poi)}>
                    <BlurView
                      intensity={68}
                      tint="light"
                      style={[styles.poiRowCard, isSel && styles.poiRowCardSelected]}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                          <View style={[styles.poiBrandPill, { backgroundColor: `${poi.brandColor}18` }]}>
                            <Text style={[styles.poiBrandText, { color: poi.brandColor }]}>{poi.brand}</Text>
                          </View>
                          {poi.availableMotor != null && poi.availableMotor >= 0 && (
                            <View style={[styles.poiBrandPill, { backgroundColor: '#FCE7F3' }]}>
                              <Text style={[styles.poiBrandText, { color: '#BE185D' }]}>
                                機車剩 {poi.availableMotor} 位
                              </Text>
                            </View>
                          )}
                          {poi.isSelfService && (
                            <View style={[styles.poiBrandPill, { backgroundColor: '#FEF3C7' }]}>
                              <Text style={[styles.poiBrandText, { color: '#B45309' }]}>刷卡自助</Text>
                            </View>
                          )}
                          <Text style={styles.poiDistText}>{poi.distanceKm} km</Text>
                        </View>
                        <Text style={styles.poiNameText} numberOfLines={1}>
                          {poi.name}
                        </Text>
                        {poi.rate ? (
                          <Text style={styles.poiRateText} numberOfLines={2}>
                            💰 {poi.rate}
                          </Text>
                        ) : null}
                        {poi.address ? (
                          <Text style={styles.poiAddrText} numberOfLines={1}>
                            {poi.address}
                          </Text>
                        ) : null}
                      </View>
                      <TouchableOpacity style={styles.poiNavBtn} onPress={() => openGobaNavigation(poi)}>
                        <Ionicons name="navigate" size={14} color="#FFF" />
                        <Text style={styles.poiNavBtnText}>導航</Text>
                      </TouchableOpacity>
                    </BlurView>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        )}
      </View>
    </View>
  );
}
