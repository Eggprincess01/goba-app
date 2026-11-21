import React from 'react';
import { Alert, Image, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../styles/theme';
import { AccountPrefs, FuelPref, MapCategory, TabType } from '../types';
import { LiveAqi, LiveOilPrices, LiveWeather, RegionInfo } from '../services/api';

interface HomeTabProps {
  region: RegionInfo;
  weather: LiveWeather | null;
  aqi: LiveAqi | null;
  oilPrices: LiveOilPrices | null;
  loadingLive: boolean;
  liveError: string | null;
  prefs: AccountPrefs;
  onRefresh: () => void;
  onOpenRegionModal: () => void;
  onSelectTab: (tab: TabType) => void;
  onOpenMapWithCategory: (cat: MapCategory) => void;
  onOpenExamModal: () => void;
  onOpenPlateModal: () => void;
}

export function HomeTab({
  region,
  weather,
  aqi,
  oilPrices,
  loadingLive,
  liveError,
  prefs,
  onRefresh,
  onOpenRegionModal,
  onSelectTab,
  onOpenMapWithCategory,
  onOpenExamModal,
  onOpenPlateModal,
}: HomeTabProps) {
  const homeQuickActions = [
    { label: '我的車庫', icon: 'car-sport', color: '#EC4899', bg: '#FCE7F3', onPress: () => onSelectTab('garage') },
    {
      label: '油價查詢',
      icon: 'flame',
      color: '#F97316',
      bg: '#FFEDD5',
      onPress: () =>
        Alert.alert(
          `台灣中油官方牌價${oilPrices?.updateDate ? `（${oilPrices.updateDate}）` : ''}`,
          `92 無鉛：$${oilPrices?.price92 || '--'} / 公升\n95 無鉛：$${oilPrices?.price95 || '--'} / 公升\n98 無鉛：$${oilPrices?.price98 || '--'} / 公升\n超級柴油：$${oilPrices?.priceDiesel || '--'} / 公升`
        ),
    },
    {
      label: '天氣資訊',
      icon: 'partly-sunny',
      color: '#0EA5E9',
      bg: '#E0F2FE',
      onPress: () =>
        Alert.alert(
          `${region.name} 即時氣象`,
          `目前氣溫：${weather?.temp ?? '--'}°C（${weather?.desc ?? '讀取中'}）\n今日高低溫：${weather?.high ?? '--'}°C / ${weather?.low ?? '--'}°C\n降雨機率：${weather?.rainProb ?? '--'}%\n相對濕度：${weather?.humidity ?? '--'}%\n風速：${weather?.windSpeed ?? '--'} km/h\n空氣品質 AQI：${aqi?.usAqi ?? '--'}（${aqi?.label ?? '--'}）`
        ),
    },
    { label: '即時路況', icon: 'navigate-circle', color: '#F43F5E', bg: '#FFE4E6', onPress: () => onOpenMapWithCategory('traffic') },
    { label: '考照服務', icon: 'card', color: '#3B82F6', bg: '#DBEAFE', onPress: onOpenExamModal },
    { label: '車牌服務', icon: 'pricetag', color: '#DB2777', bg: '#FCE7F3', onPress: onOpenPlateModal },
    { label: '停車資訊', icon: 'location', color: '#2563EB', bg: '#DBEAFE', onPress: () => onOpenMapWithCategory('parking') },
    { label: '更多服務', icon: 'ellipsis-horizontal-circle', color: '#A855F7', bg: '#F3E8FF', onPress: () => onSelectTab('services') },
  ] as const;

  return (
    <View style={styles.sectionStack}>
      {liveError ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>⚠️ {liveError}</Text>
          <TouchableOpacity style={styles.errorRetryBtn} onPress={onRefresh}>
            <Text style={styles.errorRetryText}>重試</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.heroBannerImageWrap}>
        <Image
          source={require('../assets/hero-banner.jpg')}
          style={styles.heroBannerImage}
          resizeMode="cover"
        />
      </View>

      <View style={styles.quickGrid}>
        {homeQuickActions.map((item) => (
          <TouchableOpacity
            key={item.label}
            style={styles.quickTileWrapper}
            activeOpacity={0.78}
            onPress={item.onPress}
          >
            <BlurView intensity={55} tint="light" style={styles.quickTileGlass}>
              <View style={[styles.quickIconBox, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon as any} size={23} color={item.color} />
              </View>
              <Text style={styles.quickTileLabel}>{item.label}</Text>
            </BlurView>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>今日資訊</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <Ionicons name="refresh" size={13} color="#9D174D" />
          <Text style={styles.refreshText}>
            {loadingLive ? '同步中...' : `更新 ${weather?.updatedAt || '--:--'}`}
          </Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity activeOpacity={0.85} onPress={onOpenRegionModal}>
        <BlurView intensity={65} tint="light" style={styles.glassCard}>
          <View style={styles.weatherRow}>
            <View style={styles.weatherLeft}>
              <View style={styles.weatherIconCircle}>
                <Ionicons
                  name={(weather?.icon as any) || 'partly-sunny'}
                  size={36}
                  color={weather?.icon === 'rainy' ? '#3B82F6' : '#F59E0B'}
                />
              </View>
              <View style={{ marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Ionicons name={region.isGps ? 'navigate' : 'location'} size={12} color="#DB2777" />
                  <Text style={styles.weatherLocation}>{region.name} ▾</Text>
                </View>
                <Text style={styles.weatherTemp}>{weather ? `${weather.temp}°C` : '--°C'}</Text>
                <Text style={styles.weatherDesc}>
                  {weather ? `${weather.desc} • 濕度 ${weather.humidity}%` : '即時氣象載入中...'}
                </Text>
              </View>
            </View>
            <View style={styles.weatherRight}>
              <Text style={styles.weatherHiLo}>
                <Text style={{ color: '#EF4444', fontWeight: '700' }}>↑ {weather?.high ?? '--'}°C</Text>
                {'  '}
                <Text style={{ color: '#3B82F6', fontWeight: '700' }}>↓ {weather?.low ?? '--'}°C</Text>
              </Text>
              <View style={styles.rainRow}>
                <Ionicons name="water" size={13} color="#3B82F6" />
                <Text style={styles.rainText}>降雨機率 {weather?.rainProb ?? '--'}%</Text>
              </View>
              {aqi && (
                <Text style={{ fontSize: 11, fontWeight: '700', color: aqi.color }}>
                  AQI {aqi.usAqi} {aqi.label}
                </Text>
              )}
            </View>
          </View>
        </BlurView>
      </TouchableOpacity>

      <BlurView intensity={65} tint="light" style={styles.glassCard}>
        <View style={styles.oilHeaderRow}>
          <Text style={styles.oilCardTitle}>
            今日油價 (中油官方{oilPrices?.updateDate ? ` ${oilPrices.updateDate}` : ''})
          </Text>
          <Text style={styles.oilUnit}>元/公升</Text>
        </View>
        <View style={styles.oilColumnsRow}>
          {[
            { key: '92' as FuelPref, label: '92 無鉛', val: oilPrices?.price92 || '--' },
            { key: '95' as FuelPref, label: '95 無鉛', val: oilPrices?.price95 || '--' },
            { key: '98' as FuelPref, label: '98 無鉛', val: oilPrices?.price98 || '--' },
            { key: 'diesel' as FuelPref, label: '超柴', val: oilPrices?.priceDiesel || '--' },
          ].map((f, idx) => {
            const isPref = prefs.preferredFuel === f.key;
            return (
              <React.Fragment key={f.key}>
                {idx > 0 && <View style={styles.oilColDivider} />}
                <View style={styles.oilCol}>
                  <Text style={[styles.oilColLabel, isPref && { color: '#BE185D', fontWeight: '800' }]}>
                    {f.label}
                  </Text>
                  <Text style={[styles.oilColPrice, isPref && { color: '#BE185D' }]}>{f.val}</Text>
                </View>
              </React.Fragment>
            );
          })}
        </View>
      </BlurView>
    </View>
  );
}
