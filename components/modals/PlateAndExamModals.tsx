import React from 'react';
import {
  ActivityIndicator,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../../styles/theme';
import { CarTypeOption, ExamSlot, PLATE_CAR_TYPES, PlateResult } from '../../services/api';

interface PlateAndExamModalsProps {
  // 車牌查詢 Modal
  plateModalVisible: boolean;
  onClosePlateModal: () => void;
  selectedCarType: CarTypeOption;
  onSelectCarType: (ct: CarTypeOption) => void;
  plateQuery: string;
  onChangePlateQuery: (q: string) => void;
  onRunPlateSearch: (q?: string, ct?: CarTypeOption) => void;
  plateTotal: number;
  plateUpdatedTime: string;
  plateLoading: boolean;
  plateResults: PlateResult[];
  onFavoritePlate: (p: PlateResult) => void;
  // 考照雷達 Modal
  examModalVisible: boolean;
  onCloseExamModal: () => void;
  examLicenseType: string;
  onSelectExamLicenseType: (code: string) => void;
  examFilterText: string;
  onChangeExamFilterText: (txt: string) => void;
  examAvailCount: number;
  examLoading: boolean;
  filteredExamSlots: ExamSlot[];
}

export const PlateAndExamModals: React.FC<PlateAndExamModalsProps> = ({
  plateModalVisible,
  onClosePlateModal,
  selectedCarType,
  onSelectCarType,
  plateQuery,
  onChangePlateQuery,
  onRunPlateSearch,
  plateTotal,
  plateUpdatedTime,
  plateLoading,
  plateResults,
  onFavoritePlate,
  examModalVisible,
  onCloseExamModal,
  examLicenseType,
  onSelectExamLicenseType,
  examFilterText,
  onChangeExamFilterText,
  examAvailCount,
  examLoading,
  filteredExamSlots,
}) => (
  <>
    {/* ==================== 車牌查詢 Modal ==================== */}
    <Modal visible={plateModalVisible} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
        <BlurView intensity={95} tint="light" style={[styles.modalGlassSheet, { maxHeight: '88%' }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>🚙 全台車牌即時查詢</Text>
            <TouchableOpacity onPress={onClosePlateModal}>
              <Ionicons name="close-circle" size={26} color="#9D174D" />
            </TouchableOpacity>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
            {PLATE_CAR_TYPES.map((ct) => {
              const active = selectedCarType.apiValue === ct.apiValue;
              return (
                <TouchableOpacity
                  key={ct.apiValue}
                  style={[styles.chipBtn, active && styles.chipBtnActive]}
                  onPress={() => {
                    onSelectCarType(ct);
                    onRunPlateSearch(plateQuery, ct);
                  }}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{ct.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={styles.searchRow}>
            <TextInput
              style={[styles.textInput, { flex: 1, marginRight: 8 }]}
              placeholder="輸入心儀號碼（留空看全部）"
              autoCapitalize="characters"
              value={plateQuery}
              onChangeText={onChangePlateQuery}
              onSubmitEditing={() => {
                Keyboard.dismiss();
                onRunPlateSearch();
              }}
            />
            <TouchableOpacity
              style={styles.searchGoBtn}
              onPress={() => {
                Keyboard.dismiss();
                onRunPlateSearch();
              }}
            >
              <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13 }}>查詢</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.resultMeta}>
            【{selectedCarType.label}】共 {plateTotal} 筆在庫{' '}
            {plateUpdatedTime ? `• 更新 ${plateUpdatedTime}` : ''}
          </Text>

          {plateLoading ? (
            <ActivityIndicator size="large" color="#EC4899" style={{ marginVertical: 28 }} />
          ) : (
            <ScrollView style={{ maxHeight: 330 }} keyboardShouldPersistTaps="handled">
              {plateResults.length === 0 ? (
                <Text style={styles.emptyText}>
                  【{selectedCarType.shortTag}】目前無符合「{plateQuery}」的在庫號牌
                </Text>
              ) : (
                plateResults.map((p, idx) => (
                  <View key={`${p.plate_number}-${idx}`} style={styles.plateResultRow}>
                    <View>
                      <View
                        style={[
                          styles.authenticPlateBadge,
                          {
                            backgroundColor: selectedCarType.plateBg,
                            borderColor: selectedCarType.plateBorder,
                          },
                        ]}
                      >
                        <Text
                          style={[styles.authenticPlateText, { color: selectedCarType.plateText }]}
                        >
                          {p.plate_number}
                        </Text>
                      </View>
                      <Text style={styles.plateOfficeText}>{p.motor_vehicles_office}</Text>
                    </View>
                    <TouchableOpacity style={styles.favSmallBtn} onPress={() => onFavoritePlate(p)}>
                      <Ionicons name="heart-outline" size={16} color="#DB2777" />
                      <Text style={styles.favSmallText}>收藏</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </BlurView>
      </KeyboardAvoidingView>
    </Modal>

    {/* ==================== 考照雷達 Modal ==================== */}
    <Modal visible={examModalVisible} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
        <BlurView intensity={95} tint="light" style={[styles.modalGlassSheet, { maxHeight: '86%' }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>🏍️ 全台考照即時名額</Text>
            <TouchableOpacity onPress={onCloseExamModal}>
              <Ionicons name="close-circle" size={26} color="#9D174D" />
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}>
            {[
              { code: '3', label: '普通重機' },
              { code: '5', label: '普通輕機' },
              { code: 'A', label: '自用小客車' },
            ].map((lt) => (
              <TouchableOpacity
                key={lt.code}
                style={[styles.chipBtn, examLicenseType === lt.code && styles.chipBtnActive]}
                onPress={() => onSelectExamLicenseType(lt.code)}
              >
                <Text
                  style={[styles.chipText, examLicenseType === lt.code && styles.chipTextActive]}
                >
                  {lt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={styles.textInput}
            placeholder="輸入監理站關鍵字篩選（如 士林、板橋、桃園、台中）"
            value={examFilterText}
            onChangeText={onChangeExamFilterText}
          />

          <Text style={styles.resultMeta}>
            全台即時可報名場次：{examAvailCount} 場（顯示前 40 筆）
          </Text>

          {examLoading ? (
            <ActivityIndicator size="large" color="#EC4899" style={{ marginVertical: 28 }} />
          ) : (
            <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
              {filteredExamSlots.length === 0 ? (
                <Text style={styles.emptyText}>查無符合篩選條件的可報名場次</Text>
              ) : (
                filteredExamSlots.map((slot, idx) => (
                  <View key={`${slot.station_name}-${slot.date}-${idx}`} style={styles.plateResultRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.examStationTitle}>{slot.station_name}</Text>
                      <Text style={styles.plateOfficeText}>
                        {slot.raw_date} • {slot.session_name} {slot.exam_time}
                      </Text>
                    </View>
                    <View style={styles.quotaGreenBadge}>
                      <Text style={styles.quotaGreenText}>剩 {slot.quota} 名</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          )}

          <TouchableOpacity
            style={styles.primaryPinkBtn}
            onPress={() => Linking.openURL('https://exam.mmlovenn.com')}
          >
            <Text style={styles.primaryPinkBtnText}>前往 exam.mmlovenn.com 立即預約</Text>
          </TouchableOpacity>
        </BlurView>
      </KeyboardAvoidingView>
    </Modal>
  </>
);
