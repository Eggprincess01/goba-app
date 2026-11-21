import React from 'react';
import { Alert, Text, TouchableOpacity, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { styles } from '../styles/theme';
import { VehicleFilter, VehicleItem } from '../types';
import { calcDaysUntilDate, calcInspectionStatus } from '../services/api';

interface GarageTabProps {
  vehicles: VehicleItem[];
  vehicleFilter: VehicleFilter;
  onChangeFilter: (f: VehicleFilter) => void;
  onOpenAddVehicle: () => void;
  onDeleteVehicle: (v: VehicleItem) => void;
  onOpenRefuel: (vehicleId?: string) => void;
  onOpenMaint: (vehicleId?: string) => void;
  onOpenStats: () => void;
  onOpenInsurance: (vehicleId?: string) => void;
  onOpenInspection: (vehicleId?: string) => void;
  cloudSyncStatus: string;
}

export function GarageTab({
  vehicles,
  vehicleFilter,
  onChangeFilter,
  onOpenAddVehicle,
  onDeleteVehicle,
  onOpenRefuel,
  onOpenMaint,
  onOpenStats,
  onOpenInsurance,
  onOpenInspection,
  cloudSyncStatus,
}: GarageTabProps) {
  const filteredVehicles =
    vehicleFilter === 'all' ? vehicles : vehicles.filter((v) => v.category === vehicleFilter);

  const requireVehicle = (action: () => void) => {
    if (vehicles.length === 0) {
      Alert.alert('車庫尚無車輛', '請先新增一台愛車，即可開始記錄加油、保養與提醒！', [
        { text: '取消', style: 'cancel' },
        { text: '立即新增愛車', onPress: onOpenAddVehicle },
      ]);
      return;
    }
    action();
  };

  return (
    <View style={styles.sectionStack}>
      {cloudSyncStatus ? (
        <Text style={{ fontSize: 11, color: '#9D174D', fontWeight: '600', textAlign: 'right' }}>
          ☁️ {cloudSyncStatus}
        </Text>
      ) : null}

      <BlurView intensity={60} tint="light" style={styles.segmentedBar}>
        {[
          { key: 'all', label: `全部 (${vehicles.length})` },
          { key: 'scooter', label: '機車' },
          { key: 'car', label: '汽車' },
        ].map((seg) => {
          const active = vehicleFilter === seg.key;
          return (
            <TouchableOpacity
              key={seg.key}
              style={[styles.segmentBtn, active && styles.segmentBtnActive]}
              onPress={() => onChangeFilter(seg.key as VehicleFilter)}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{seg.label}</Text>
            </TouchableOpacity>
          );
        })}
      </BlurView>

      {filteredVehicles.length === 0 ? (
        <BlurView intensity={70} tint="light" style={styles.emptyGarageCard}>
          <MaterialCommunityIcons name="garage-open-variant" size={48} color="#EC4899" />
          <Text style={styles.emptyGarageTitle}>
            {vehicles.length === 0 ? '您的車庫還是空的' : '此分類尚無車輛'}
          </Text>
          <Text style={styles.emptyGarageSub}>
            新增您的第一台愛車，即可追蹤真實里程、油耗、保養紀錄、強制險與定檢提醒！
          </Text>
          <TouchableOpacity style={[styles.primaryPinkBtn, { width: '100%', marginTop: 0 }]} onPress={onOpenAddVehicle}>
            <Text style={styles.primaryPinkBtnText}>+ 新增第一台愛車</Text>
          </TouchableOpacity>
        </BlurView>
      ) : (
        filteredVehicles.map((v) => {
          const insDays = calcDaysUntilDate(v.insuranceExpiry);
          const insp = calcInspectionStatus(v.category, v.manufactureYM, v.lastInspectionDate);
          return (
            <BlurView key={v.id} intensity={70} tint="light" style={styles.garageVehicleCard}>
              <View style={styles.garageTopRow}>
                <View style={[styles.vehicleThumbBox, { backgroundColor: `${v.accentColor}15` }]}>
                  <MaterialCommunityIcons
                    name={v.category === 'scooter' ? 'motorbike' : 'car'}
                    size={38}
                    color={v.accentColor}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 14 }}>
                  <View style={styles.vehicleTitleRow}>
                    <Text style={styles.vehicleName}>{v.nickname}</Text>
                    <TouchableOpacity
                      onPress={() =>
                        Alert.alert(
                          v.nickname,
                          `車種：${v.typeLabel}\n出廠年月：${v.manufactureYM || '尚未設定'}\n定檢狀態：${insp.statusText}\n強制險到期：${v.insuranceExpiry ? `${v.insuranceExpiry} (剩 ${insDays} 天)` : '尚未設定'}`,
                          [
                            { text: '關閉', style: 'cancel' },
                            { text: '🛡️ 設定保險日期', onPress: () => onOpenInsurance(v.id) },
                            { text: '✅ 設定出廠/定檢', onPress: () => onOpenInspection(v.id) },
                            { text: '移除車輛', style: 'destructive', onPress: () => onDeleteVehicle(v) },
                          ]
                        )
                      }
                    >
                      <Ionicons name="ellipsis-horizontal" size={20} color="#9D174D" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.pinkPlateBadge}>
                    <Text style={styles.pinkPlateText}>{v.plate}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.garageMetaRow}>
                <View style={styles.garageMetaItem}>
                  <Ionicons name="speedometer-outline" size={14} color="#9D174D" />
                  <Text style={styles.garageMetaText}>里程 {v.mileage.toLocaleString()} km</Text>
                </View>
                <View style={styles.garageMetaItem}>
                  <Ionicons name="shield-checkmark-outline" size={14} color="#DB2777" />
                  <Text style={styles.garageMetaText}>下次保養 {v.nextMaintKm.toLocaleString()} km</Text>
                </View>
              </View>
            </BlurView>
          );
        })
      )}

      {vehicles.length > 0 && (
        <TouchableOpacity activeOpacity={0.8} onPress={onOpenAddVehicle}>
          <LinearGradient
            colors={['rgba(251, 207, 232, 0.72)', 'rgba(244, 114, 182, 0.35)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.addVehicleWideBtn}
          >
            <Ionicons name="add" size={20} color="#9D174D" />
            <Text style={styles.addVehicleWideText}>新增車輛</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}

      <View style={styles.garageToolsGrid}>
        {[
          {
            label: '加油紀錄',
            icon: 'water-outline',
            color: '#F97316',
            bg: '#FFEDD5',
            action: () => requireVehicle(() => onOpenRefuel()),
          },
          {
            label: '保養紀錄',
            icon: 'build-outline',
            color: '#EC4899',
            bg: '#FCE7F3',
            action: () => requireVehicle(() => onOpenMaint()),
          },
          {
            label: '油耗統計',
            icon: 'bar-chart-outline',
            color: '#8B5CF6',
            bg: '#EDE9FE',
            action: onOpenStats,
          },
          {
            label: '保險提醒',
            icon: 'shield-outline',
            color: '#3B82F6',
            bg: '#DBEAFE',
            action: () => requireVehicle(() => onOpenInsurance()),
          },
          {
            label: '驗車提醒',
            icon: 'checkmark-done-circle-outline',
            color: '#10B981',
            bg: '#D1FAE5',
            action: () => requireVehicle(() => onOpenInspection()),
          },
          {
            label: '稅金提醒',
            icon: 'wallet-outline',
            color: '#F59E0B',
            bg: '#FEF3C7',
            action: () =>
              Alert.alert(
                '牌照稅 ＆ 燃料費繳納月份 💰',
                '• 4 月 1 日 ~ 4 月 30 日：使用牌照稅\n• 7 月 1 日 ~ 7 月 31 日：汽機車燃料使用費'
              ),
          },
        ].map((tool) => (
          <TouchableOpacity
            key={tool.label}
            style={styles.garageToolWrapper}
            activeOpacity={0.78}
            onPress={tool.action}
          >
            <BlurView intensity={60} tint="light" style={styles.garageToolGlass}>
              <View style={[styles.garageToolIconBox, { backgroundColor: tool.bg }]}>
                <Ionicons name={tool.icon as any} size={24} color={tool.color} />
              </View>
              <Text style={styles.garageToolLabel}>{tool.label}</Text>
            </BlurView>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
