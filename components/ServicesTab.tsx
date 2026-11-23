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
  onOpenFleetModal: () => void;
  onSelectTab: (tab: TabType) => void;
}

export function ServicesTab({
  region,
  aqi,
  onOpenExamModal,
  onOpenPlateModal,
  onOpenFleetModal,
  onSelectTab,
}: ServicesTabProps) {
  return (
    <View style={styles.sectionStack}>
      <Text style={styles.sectionTitle}>生活工具</Text>
      <View style={styles.quickGrid}>
        {[
          { label: '考照報名助手', icon: 'id-card', color: '#DB2777', bg: '#FCE7F3', onPress: onOpenExamModal },
          { label: '車牌尋找 ＆ 庫存', icon: 'search', color: '#EC4899', bg: '#FCE7F3', onPress: onOpenPlateModal },
          { label: '車隊模式（永久）', icon: 'people', color: '#8B5CF6', bg: '#EDE9FE', onPress: onOpenFleetModal },
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
