import React from 'react';
import {
  KeyboardAvoidingView,
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
import {
  COMMON_MAINT_ITEMS,
  FUEL_OPTIONS,
  FuelPref,
  MaintLog,
  MaintSubItem,
  RefuelLog,
  VehicleItem,
} from '../../types';
import { calcDaysUntilDate, calcInspectionStatus } from '../../services/api';

interface GarageModalsProps {
  vehicles: VehicleItem[];
  // 保險
  insuranceModalVisible: boolean;
  onCloseInsuranceModal: () => void;
  insVehicleId: string;
  onChangeInsVehicleId: (id: string) => void;
  insVehicleDropdownOpen: boolean;
  onToggleInsVehicleDropdown: () => void;
  activeInsVehicle: VehicleItem | undefined;
  insExpiryInput: string;
  onChangeInsExpiryInput: (v: string) => void;
  onSaveInsurance: () => void;
  // 驗車
  inspectionModalVisible: boolean;
  onCloseInspectionModal: () => void;
  inspVehicleId: string;
  onChangeInspVehicleId: (id: string) => void;
  inspVehicleDropdownOpen: boolean;
  onToggleInspVehicleDropdown: () => void;
  activeInspVehicle: VehicleItem | undefined;
  inspMfgInput: string;
  onChangeInspMfgInput: (v: string) => void;
  inspLastDateInput: string;
  onChangeInspLastDateInput: (v: string) => void;
  onSaveInspection: () => void;
  // 加油
  refuelModalVisible: boolean;
  onCloseRefuelModal: () => void;
  refuelVehicleId: string;
  onChangeRefuelVehicleId: (id: string) => void;
  refuelVehicleDropdownOpen: boolean;
  onToggleRefuelVehicleDropdown: (open: boolean) => void;
  activeRefuelVehicle: VehicleItem | undefined;
  refuelFuelType: FuelPref;
  refuelFuelDropdownOpen: boolean;
  onToggleRefuelFuelDropdown: (open: boolean) => void;
  getFuelUnitPrice: (fuel: FuelPref) => number;
  onSelectRefuelFuelType: (fuel: FuelPref) => void;
  refuelLiters: string;
  onChangeRefuelLiters: (v: string) => void;
  refuelOriginalAmount: string;
  onChangeRefuelOriginalAmount: (v: string) => void;
  refuelDiscountedAmount: string;
  onChangeRefuelDiscountedAmount: (v: string) => void;
  refuelKm: string;
  onChangeRefuelKm: (v: string) => void;
  onAddRefuel: () => void;
  // 保養
  maintModalVisible: boolean;
  onCloseMaintModal: () => void;
  maintVehicleId: string;
  onChangeMaintVehicleId: (id: string) => void;
  maintVehicleDropdownOpen: boolean;
  onToggleMaintVehicleDropdown: () => void;
  activeMaintVehicle: VehicleItem | undefined;
  maintCustomName: string;
  onChangeMaintCustomName: (v: string) => void;
  maintCustomCost: string;
  onChangeMaintCustomCost: (v: string) => void;
  maintDraftItems: MaintSubItem[];
  maintDraftTotal: number;
  onAddMaintSubItem: (name?: string, cost?: string) => void;
  onUpdateMaintItemCost: (id: string, val: string) => void;
  onRemoveMaintSubItem: (id: string) => void;
  maintKm: string;
  onChangeMaintKm: (v: string) => void;
  onSaveMaint: () => void;
  // 油耗統計
  statsModalVisible: boolean;
  onCloseStatsModal: () => void;
  totalFuelSpent: number;
  totalFuelLiters: number;
  refuelLogs: RefuelLog[];
  maintLogs: MaintLog[];
  // 新增車輛
  addVehicleModalVisible: boolean;
  onCloseAddVehicleModal: () => void;
  newVehicleCategory: 'scooter' | 'car';
  onChangeNewVehicleCategory: (c: 'scooter' | 'car') => void;
  newVehicleName: string;
  onChangeNewVehicleName: (v: string) => void;
  newVehiclePlate: string;
  onChangeNewVehiclePlate: (v: string) => void;
  newVehicleKm: string;
  onChangeNewVehicleKm: (v: string) => void;
  newVehicleMfgYM: string;
  onChangeNewVehicleMfgYM: (v: string) => void;
  newVehicleLastInsp: string;
  onChangeNewVehicleLastInsp: (v: string) => void;
  newVehicleInsExpiry: string;
  onChangeNewVehicleInsExpiry: (v: string) => void;
  onAddVehicle: () => void;
}

export const GarageModals: React.FC<GarageModalsProps> = ({
  vehicles,
  insuranceModalVisible,
  onCloseInsuranceModal,
  insVehicleId,
  onChangeInsVehicleId,
  insVehicleDropdownOpen,
  onToggleInsVehicleDropdown,
  activeInsVehicle,
  insExpiryInput,
  onChangeInsExpiryInput,
  onSaveInsurance,
  inspectionModalVisible,
  onCloseInspectionModal,
  inspVehicleId,
  onChangeInspVehicleId,
  inspVehicleDropdownOpen,
  onToggleInspVehicleDropdown,
  activeInspVehicle,
  inspMfgInput,
  onChangeInspMfgInput,
  inspLastDateInput,
  onChangeInspLastDateInput,
  onSaveInspection,
  refuelModalVisible,
  onCloseRefuelModal,
  refuelVehicleId,
  onChangeRefuelVehicleId,
  refuelVehicleDropdownOpen,
  onToggleRefuelVehicleDropdown,
  activeRefuelVehicle,
  refuelFuelType,
  refuelFuelDropdownOpen,
  onToggleRefuelFuelDropdown,
  getFuelUnitPrice,
  onSelectRefuelFuelType,
  refuelLiters,
  onChangeRefuelLiters,
  refuelOriginalAmount,
  onChangeRefuelOriginalAmount,
  refuelDiscountedAmount,
  onChangeRefuelDiscountedAmount,
  refuelKm,
  onChangeRefuelKm,
  onAddRefuel,
  maintModalVisible,
  onCloseMaintModal,
  maintVehicleId,
  onChangeMaintVehicleId,
  maintVehicleDropdownOpen,
  onToggleMaintVehicleDropdown,
  activeMaintVehicle,
  maintCustomName,
  onChangeMaintCustomName,
  maintCustomCost,
  onChangeMaintCustomCost,
  maintDraftItems,
  maintDraftTotal,
  onAddMaintSubItem,
  onUpdateMaintItemCost,
  onRemoveMaintSubItem,
  maintKm,
  onChangeMaintKm,
  onSaveMaint,
  statsModalVisible,
  onCloseStatsModal,
  totalFuelSpent,
  totalFuelLiters,
  refuelLogs,
  maintLogs,
  addVehicleModalVisible,
  onCloseAddVehicleModal,
  newVehicleCategory,
  onChangeNewVehicleCategory,
  newVehicleName,
  onChangeNewVehicleName,
  newVehiclePlate,
  onChangeNewVehiclePlate,
  newVehicleKm,
  onChangeNewVehicleKm,
  newVehicleMfgYM,
  onChangeNewVehicleMfgYM,
  newVehicleLastInsp,
  onChangeNewVehicleLastInsp,
  newVehicleInsExpiry,
  onChangeNewVehicleInsExpiry,
  onAddVehicle,
}) => (
  <>
    {/* ==================== 保險到期提醒 Modal ==================== */}
    <Modal visible={insuranceModalVisible} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
        <BlurView intensity={95} tint="light" style={[styles.modalGlassSheet, { maxHeight: '85%' }]}>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🛡️ 強制險到期日設定</Text>
              <TouchableOpacity onPress={onCloseInsuranceModal}>
                <Ionicons name="close-circle" size={26} color="#9D174D" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>選擇車輛</Text>
            <TouchableOpacity style={styles.dropdownTrigger} onPress={onToggleInsVehicleDropdown}>
              <Text style={styles.dropdownTriggerText}>
                {activeInsVehicle
                  ? `${activeInsVehicle.nickname} (${activeInsVehicle.plate})`
                  : '請選擇車輛'}
              </Text>
              <Ionicons
                name={insVehicleDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#9D174D"
              />
            </TouchableOpacity>
            {insVehicleDropdownOpen && (
              <View style={styles.dropdownList}>
                {vehicles.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={styles.dropdownOption}
                    onPress={() => {
                      onChangeInsVehicleId(v.id);
                      onChangeInsExpiryInput(v.insuranceExpiry || '');
                      onToggleInsVehicleDropdown();
                    }}
                  >
                    <Text style={styles.dropdownOptionText}>
                      {v.nickname} ({v.plate})
                    </Text>
                    {v.id === insVehicleId && <Ionicons name="checkmark" size={16} color="#DB2777" />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={styles.statusBoxCard}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: '#5B2333' }}>
                目前狀態：
                {(() => {
                  const d = calcDaysUntilDate(insExpiryInput);
                  if (d === null) return '尚未設定到期日';
                  return d < 0 ? `已過期 ${Math.abs(d)} 天 ⚠️` : `距離到期還有 ${d} 天`;
                })()}
              </Text>
            </View>

            <Text style={styles.inputLabel}>強制險到期日 (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="例如：2027-05-20"
              value={insExpiryInput}
              onChangeText={onChangeInsExpiryInput}
            />

            <TouchableOpacity style={styles.primaryPinkBtn} onPress={onSaveInsurance}>
              <Text style={styles.primaryPinkBtnText}>儲存保險到期日</Text>
            </TouchableOpacity>
          </ScrollView>
        </BlurView>
      </KeyboardAvoidingView>
    </Modal>

    {/* ==================== 驗車 / 排氣定檢 Modal ==================== */}
    <Modal visible={inspectionModalVisible} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
        <BlurView intensity={95} tint="light" style={[styles.modalGlassSheet, { maxHeight: '85%' }]}>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>✅ 驗車 / 排氣定檢設定</Text>
              <TouchableOpacity onPress={onCloseInspectionModal}>
                <Ionicons name="close-circle" size={26} color="#9D174D" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>選擇車輛</Text>
            <TouchableOpacity style={styles.dropdownTrigger} onPress={onToggleInspVehicleDropdown}>
              <Text style={styles.dropdownTriggerText}>
                {activeInspVehicle
                  ? `${activeInspVehicle.nickname} (${activeInspVehicle.plate})`
                  : '請選擇車輛'}
              </Text>
              <Ionicons
                name={inspVehicleDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#9D174D"
              />
            </TouchableOpacity>
            {inspVehicleDropdownOpen && (
              <View style={styles.dropdownList}>
                {vehicles.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={styles.dropdownOption}
                    onPress={() => {
                      onChangeInspVehicleId(v.id);
                      onChangeInspMfgInput(v.manufactureYM || '');
                      onChangeInspLastDateInput(v.lastInspectionDate || '');
                      onToggleInspVehicleDropdown();
                    }}
                  >
                    <Text style={styles.dropdownOptionText}>
                      {v.nickname} ({v.plate})
                    </Text>
                    {v.id === inspVehicleId && <Ionicons name="checkmark" size={16} color="#DB2777" />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {activeInspVehicle &&
              (() => {
                const st = calcInspectionStatus(
                  activeInspVehicle.category,
                  inspMfgInput,
                  inspLastDateInput
                );
                return (
                  <View style={styles.statusBoxCard}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '800',
                        color: st.isDueSoon ? '#DC2626' : '#059669',
                      }}
                    >
                      {st.statusText}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#6B4C5A', marginTop: 3 }}>{st.detail}</Text>
                  </View>
                );
              })()}

            <Text style={styles.inputLabel}>出廠年月 (YYYY-MM)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="例如：2020-06"
              value={inspMfgInput}
              onChangeText={onChangeInspMfgInput}
            />

            <Text style={styles.inputLabel}>上次定檢日期 (YYYY-MM-DD，選填)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="例如：2026-06-15"
              value={inspLastDateInput}
              onChangeText={onChangeInspLastDateInput}
            />

            <TouchableOpacity style={styles.primaryPinkBtn} onPress={onSaveInspection}>
              <Text style={styles.primaryPinkBtnText}>儲存出廠年月與定檢日期</Text>
            </TouchableOpacity>
          </ScrollView>
        </BlurView>
      </KeyboardAvoidingView>
    </Modal>

    {/* ==================== 加油記帳 Modal ==================== */}
    <Modal visible={refuelModalVisible} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
        <BlurView intensity={95} tint="light" style={[styles.modalGlassSheet, { maxHeight: '88%' }]}>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⛽ 新增加油紀錄</Text>
              <TouchableOpacity onPress={onCloseRefuelModal}>
                <Ionicons name="close-circle" size={26} color="#9D174D" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>選擇車輛</Text>
            <TouchableOpacity
              style={styles.dropdownTrigger}
              onPress={() => {
                onToggleRefuelVehicleDropdown(!refuelVehicleDropdownOpen);
                onToggleRefuelFuelDropdown(false);
              }}
            >
              <Text style={styles.dropdownTriggerText}>
                {activeRefuelVehicle
                  ? `${activeRefuelVehicle.nickname} (${activeRefuelVehicle.plate})`
                  : '請選擇車輛'}
              </Text>
              <Ionicons
                name={refuelVehicleDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#9D174D"
              />
            </TouchableOpacity>
            {refuelVehicleDropdownOpen && (
              <View style={styles.dropdownList}>
                {vehicles.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={styles.dropdownOption}
                    onPress={() => {
                      onChangeRefuelVehicleId(v.id);
                      onToggleRefuelVehicleDropdown(false);
                    }}
                  >
                    <Text style={styles.dropdownOptionText}>
                      {v.nickname} ({v.plate})
                    </Text>
                    {v.id === refuelVehicleId && (
                      <Ionicons name="checkmark" size={16} color="#DB2777" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.inputLabel}>選擇油品（依今日中油牌價自動換算）</Text>
            <TouchableOpacity
              style={styles.dropdownTrigger}
              onPress={() => {
                onToggleRefuelFuelDropdown(!refuelFuelDropdownOpen);
                onToggleRefuelVehicleDropdown(false);
              }}
            >
              <Text style={styles.dropdownTriggerText}>
                {FUEL_OPTIONS.find((f) => f.key === refuelFuelType)?.label}（$
                {getFuelUnitPrice(refuelFuelType) || '--'}/L）
              </Text>
              <Ionicons
                name={refuelFuelDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#9D174D"
              />
            </TouchableOpacity>
            {refuelFuelDropdownOpen && (
              <View style={styles.dropdownList}>
                {FUEL_OPTIONS.map((f) => (
                  <TouchableOpacity
                    key={f.key}
                    style={styles.dropdownOption}
                    onPress={() => onSelectRefuelFuelType(f.key)}
                  >
                    <Text style={styles.dropdownOptionText}>
                      {f.label} — ${getFuelUnitPrice(f.key) || '--'}/L
                    </Text>
                    {f.key === refuelFuelType && (
                      <Ionicons name="checkmark" size={16} color="#DB2777" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>加油公升數 (L)</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="decimal-pad"
                  placeholder="輸入自動算金額"
                  value={refuelLiters}
                  onChangeText={onChangeRefuelLiters}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>原價金額 (NT$)</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  placeholder="輸入自動算公升"
                  value={refuelOriginalAmount}
                  onChangeText={onChangeRefuelOriginalAmount}
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>折扣後實付金額 (NT$，選填 — 自助加油折扣用)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              placeholder="無折扣可留空，將以原價金額計算"
              value={refuelDiscountedAmount}
              onChangeText={onChangeRefuelDiscountedAmount}
            />

            <Text style={styles.inputLabel}>當前儀表總里程 (km)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              placeholder={`前次里程：${activeRefuelVehicle?.mileage || 0}`}
              value={refuelKm}
              onChangeText={onChangeRefuelKm}
            />

            <TouchableOpacity style={styles.primaryPinkBtn} onPress={onAddRefuel}>
              <Text style={styles.primaryPinkBtnText}>儲存並計算實測油耗</Text>
            </TouchableOpacity>
          </ScrollView>
        </BlurView>
      </KeyboardAvoidingView>
    </Modal>

    {/* ==================== 保養紀錄 Modal ==================== */}
    <Modal visible={maintModalVisible} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
        <BlurView intensity={95} tint="light" style={[styles.modalGlassSheet, { maxHeight: '90%' }]}>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>🔧 新增保養 / 維修紀錄</Text>
              <TouchableOpacity onPress={onCloseMaintModal}>
                <Ionicons name="close-circle" size={26} color="#9D174D" />
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>選擇車輛</Text>
            <TouchableOpacity style={styles.dropdownTrigger} onPress={onToggleMaintVehicleDropdown}>
              <Text style={styles.dropdownTriggerText}>
                {activeMaintVehicle
                  ? `${activeMaintVehicle.nickname} (${activeMaintVehicle.plate})`
                  : '請選擇車輛'}
              </Text>
              <Ionicons
                name={maintVehicleDropdownOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color="#9D174D"
              />
            </TouchableOpacity>
            {maintVehicleDropdownOpen && (
              <View style={styles.dropdownList}>
                {vehicles.map((v) => (
                  <TouchableOpacity
                    key={v.id}
                    style={styles.dropdownOption}
                    onPress={() => {
                      onChangeMaintVehicleId(v.id);
                      onToggleMaintVehicleDropdown();
                    }}
                  >
                    <Text style={styles.dropdownOptionText}>
                      {v.nickname} ({v.plate})
                    </Text>
                    {v.id === maintVehicleId && (
                      <Ionicons name="checkmark" size={16} color="#DB2777" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.inputLabel}>快速點選加入常見項目</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
              {COMMON_MAINT_ITEMS.map((itemName) => (
                <TouchableOpacity
                  key={itemName}
                  style={styles.chipBtn}
                  onPress={() => onAddMaintSubItem(itemName, '0')}
                >
                  <Text style={styles.chipText}>+ {itemName}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>或自行新增維修 / 保養項目</Text>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <TextInput
                style={[styles.textInput, { flex: 1.6 }]}
                placeholder="項目名稱（例：更換碟盤）"
                value={maintCustomName}
                onChangeText={onChangeMaintCustomName}
              />
              <TextInput
                style={[styles.textInput, { flex: 0.9 }]}
                keyboardType="numeric"
                placeholder="費用"
                value={maintCustomCost}
                onChangeText={onChangeMaintCustomCost}
              />
              <TouchableOpacity style={styles.addSubItemBtn} onPress={() => onAddMaintSubItem()}>
                <Ionicons name="add" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>

            {maintDraftItems.length > 0 && (
              <View style={styles.maintListBox}>
                <View
                  style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#5B2333' }}>
                    本次項目明細 ({maintDraftItems.length} 項)
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: '900', color: '#DB2777' }}>
                    合計 NT$ {maintDraftTotal.toLocaleString()}
                  </Text>
                </View>
                {maintDraftItems.map((it) => (
                  <View key={it.id} style={styles.maintSubItemRow}>
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#3B1525' }}>
                      • {it.name}
                    </Text>
                    <TextInput
                      style={styles.miniPriceInput}
                      keyboardType="numeric"
                      placeholder="$"
                      value={it.cost > 0 ? String(it.cost) : ''}
                      onChangeText={(val) => onUpdateMaintItemCost(it.id, val)}
                    />
                    <TouchableOpacity
                      onPress={() => onRemoveMaintSubItem(it.id)}
                      style={{ marginLeft: 8 }}
                    >
                      <Ionicons name="trash-outline" size={18} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.inputLabel}>保養當下里程 (km)</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              placeholder={`目前里程：${activeMaintVehicle?.mileage || 0}`}
              value={maintKm}
              onChangeText={onChangeMaintKm}
            />

            <TouchableOpacity style={styles.primaryPinkBtn} onPress={onSaveMaint}>
              <Text style={styles.primaryPinkBtnText}>
                儲存保養紀錄（共 NT$ {maintDraftTotal.toLocaleString()}）
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </BlurView>
      </KeyboardAvoidingView>
    </Modal>

    {/* ==================== 油耗與歷史明細 Modal ==================== */}
    <Modal visible={statsModalVisible} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
        <BlurView intensity={92} tint="light" style={[styles.modalGlassSheet, { maxHeight: '78%' }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>📊 油耗與歷史明細</Text>
            <TouchableOpacity onPress={onCloseStatsModal}>
              <Ionicons name="close-circle" size={26} color="#9D174D" />
            </TouchableOpacity>
          </View>

          <View style={styles.quotaRow}>
            <View style={styles.quotaCol}>
              <Text style={styles.quotaVal}>${totalFuelSpent}</Text>
              <Text style={styles.quotaLbl}>實付油資</Text>
            </View>
            <View style={styles.oilColDivider} />
            <View style={styles.quotaCol}>
              <Text style={[styles.quotaVal, { color: '#DB2777' }]}>
                {totalFuelLiters.toFixed(1)} L
              </Text>
              <Text style={styles.quotaLbl}>累積加油</Text>
            </View>
            <View style={styles.oilColDivider} />
            <View style={styles.quotaCol}>
              <Text style={[styles.quotaVal, { color: '#059669' }]}>{maintLogs.length} 次</Text>
              <Text style={styles.quotaLbl}>保養紀錄</Text>
            </View>
          </View>

          <ScrollView style={{ marginTop: 14, maxHeight: 280 }}>
            {refuelLogs.length === 0 && maintLogs.length === 0 ? (
              <Text style={styles.emptyText}>尚未有加油或保養紀錄</Text>
            ) : (
              <>
                {refuelLogs.map((log) => (
                  <View key={log.id} style={styles.plateResultRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.examStationTitle}>
                        ⛽ {log.vehicleName}（{log.fuelLabel}）
                      </Text>
                      <Text style={styles.plateOfficeText}>
                        {log.date} • {log.liters}L • 里程 {log.odometer} km
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={{ fontWeight: '900', color: '#BE185D' }}>
                        NT$ {log.paidAmount}
                      </Text>
                      {log.originalAmount > log.paidAmount && (
                        <Text style={{ fontSize: 10, color: '#059669' }}>
                          省 ${Math.round(log.originalAmount - log.paidAmount)}
                        </Text>
                      )}
                      {log.kmPerLiter ? (
                        <Text style={{ fontSize: 11, color: '#059669', fontWeight: '700' }}>
                          {log.kmPerLiter} km/L
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
                {maintLogs.map((m) => (
                  <View key={m.id} style={styles.plateResultRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.examStationTitle}>🔧 {m.vehicleName}</Text>
                      <Text style={styles.plateOfficeText}>
                        {m.date} • {m.items.map((x) => x.name).join('、')}
                      </Text>
                    </View>
                    <Text style={{ fontWeight: '900', color: '#5B2333' }}>NT$ {m.totalCost}</Text>
                  </View>
                ))}
              </>
            )}
          </ScrollView>
        </BlurView>
      </View>
    </Modal>

    {/* ==================== 新增車輛 Modal ==================== */}
    <Modal visible={addVehicleModalVisible} transparent animationType="slide">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalOverlay}
      >
        <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
        <BlurView intensity={95} tint="light" style={[styles.modalGlassSheet, { maxHeight: '90%' }]}>
          <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>✨ 新增愛車到車庫</Text>
              <TouchableOpacity onPress={onCloseAddVehicleModal}>
                <Ionicons name="close-circle" size={26} color="#9D174D" />
              </TouchableOpacity>
            </View>

            <View style={styles.categorySwitchRow}>
              <TouchableOpacity
                style={[styles.catBtn, newVehicleCategory === 'scooter' && styles.catBtnActive]}
                onPress={() => onChangeNewVehicleCategory('scooter')}
              >
                <Text
                  style={[
                    styles.catBtnText,
                    newVehicleCategory === 'scooter' && styles.catBtnTextActive,
                  ]}
                >
                  🏍️ 機車 / 重機
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.catBtn, newVehicleCategory === 'car' && styles.catBtnActive]}
                onPress={() => onChangeNewVehicleCategory('car')}
              >
                <Text
                  style={[styles.catBtnText, newVehicleCategory === 'car' && styles.catBtnTextActive]}
                >
                  🚗 汽車
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>愛車名稱 / 型號 *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="例如：MMBCU 158 或 Honda Civic"
              value={newVehicleName}
              onChangeText={onChangeNewVehicleName}
            />

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>車牌號碼 *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="例：PHP-9969"
                  autoCapitalize="characters"
                  value={newVehiclePlate}
                  onChangeText={onChangeNewVehiclePlate}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>目前里程 (km)</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  placeholder="例：5200"
                  value={newVehicleKm}
                  onChangeText={onChangeNewVehicleKm}
                />
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>出廠年月 (YYYY-MM)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="例：2021-06"
                  value={newVehicleMfgYM}
                  onChangeText={onChangeNewVehicleMfgYM}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.inputLabel}>上次定檢 (選填)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="YYYY-MM-DD"
                  value={newVehicleLastInsp}
                  onChangeText={onChangeNewVehicleLastInsp}
                />
              </View>
            </View>

            <Text style={styles.inputLabel}>強制險到期日 (YYYY-MM-DD，選填)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="例：2027-05-20（未填則顯示尚未設定）"
              value={newVehicleInsExpiry}
              onChangeText={onChangeNewVehicleInsExpiry}
            />

            <TouchableOpacity style={styles.primaryPinkBtn} onPress={onAddVehicle}>
              <Text style={styles.primaryPinkBtnText}>確認加入我的車庫</Text>
            </TouchableOpacity>
          </ScrollView>
        </BlurView>
      </KeyboardAvoidingView>
    </Modal>
  </>
);
