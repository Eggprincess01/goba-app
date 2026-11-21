import React from 'react';
import { Alert, Image, Linking, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../styles/theme';
import { MapCategory, TabType } from '../types';
import { LiveAqi, RegionInfo } from '../services/api';

interface ServicesTabProps {
  region: RegionInfo;
  aqi: LiveAqi | null;
  onOpenExamModal: () => void;
  onOpenPlateModal: () => void;
  onOpenMapWithCategory: (cat: MapCategory) => void;
  onSelectTab: (tab: TabType) => void;
  onOpenRegionModal: () => void;
}

export function ServicesTab({
  region,
  aqi,
  onOpenExamModal,
  onOpenPlateModal,
  onOpenMapWithCategory,
  onSelectTab,
  onOpenRegionModal,
}: ServicesTabProps) {
  return (
    <View style={styles.sectionStack}>
      <Text style={styles.sectionTitle}>考照服務</Text>
      <TouchableOpacity activeOpacity={0.82} onPress={onOpenExamModal}>
        <BlurView intensity={68} tint="light" style={styles.serviceBannerCard}>
          <View style={[styles.serviceLeadIcon, { backgroundColor: '#FCE7F3' }]}>
            <Ionicons name="id-card" size={26} color="#DB2777" />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.serviceCardTitle}>考照報名助手</Text>
            <Text style={styles.serviceCardSub}>全台 37 站監理所即時剩餘名額查詢</Text>
          </View>
          <Image source={require('../assets/icon.png')} style={styles.serviceMascotMini} />
        </BlurView>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>車牌服務</Text>
      <TouchableOpacity activeOpacity={0.82} onPress={onOpenPlateModal}>
        <BlurView intensity={68} tint="light" style={styles.serviceBannerCard}>
          <View style={styles.pinkPlateBadgeLarge}>
            <Text style={styles.pinkPlateTextLarge}>9969</Text>
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.serviceCardTitle}>車牌尋找 ＆ 庫存查詢</Text>
            <Text style={styles.serviceCardSub}>白牌・黃牌・紅牌・汽車等 14 種車牌即時搜尋</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#9D174D" />
        </BlurView>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>交通相關</Text>
      <View style={styles.quickGrid}>
        {[
          { label: '加油站地圖', icon: 'flame', color: '#F97316', bg: '#FFEDD5', onPress: () => onOpenMapWithCategory('gas') },
          { label: '停車資訊', icon: 'location', color: '#2563EB', bg: '#DBEAFE', onPress: () => onOpenMapWithCategory('parking') },
          { label: '即時路況', icon: 'car', color: '#EC4899', bg: '#FCE7F3', onPress: () => onOpenMapWithCategory('traffic') },
          { label: '監理站據點', icon: 'business', color: '#8B5CF6', bg: '#EDE9FE', onPress: () => onOpenMapWithCategory('dmv') },
        ].map((item) => (
          <TouchableOpacity key={item.label} style={styles.quickTileWrapper} onPress={item.onPress}>
            <BlurView intensity={58} tint="light" style={styles.quickTileGlass}>
              <View style={[styles.quickIconBox, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon as any} size={22} color={item.color} />
              </View>
              <Text style={styles.quickTileLabel}>{item.label}</Text>
            </BlurView>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>生活工具</Text>
      <View style={styles.quickGrid}>
        {[
          { label: '天氣資訊', icon: 'partly-sunny', color: '#0EA5E9', bg: '#E0F2FE', onPress: () => onSelectTab('home') },
          {
            label: '空氣品質',
            icon: 'cloud-outline',
            color: '#84CC16',
            bg: '#ECFCCB',
            onPress: () =>
              Alert.alert(
                `${region.name} 即時空氣品質`,
                `US AQI：${aqi?.usAqi ?? '--'}（${aqi?.label ?? '讀取中'}）\nPM2.5：${aqi?.pm25 ?? '--'} μg/m³`
              ),
          },
          { label: '地區設定', icon: 'navigate', color: '#14B8A6', bg: '#CCFBF1', onPress: onOpenRegionModal },
          { label: '官網主站', icon: 'globe-outline', color: '#EC4899', bg: '#FCE7F3', onPress: () => Linking.openURL('https://mmlovenn.com') },
        ].map((item) => (
          <TouchableOpacity key={item.label} style={styles.quickTileWrapper} onPress={item.onPress}>
            <BlurView intensity={58} tint="light" style={styles.quickTileGlass}>
              <View style={[styles.quickIconBox, { backgroundColor: item.bg }]}>
                <Ionicons name={item.icon as any} size={22} color={item.color} />
              </View>
              <Text style={styles.quickTileLabel}>{item.label}</Text>
            </BlurView>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
