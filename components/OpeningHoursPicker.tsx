import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type HoursMode = '24h' | 'daily_same' | 'custom';

interface TimeSlot {
  start: string;
  end: string;
}

interface DaySchedule {
  closed: boolean;
  slots: TimeSlot[];
}

const DAY_LABELS = ['週一', '週二', '週三', '週四', '週五', '週六', '週日'];

interface OpeningHoursPickerProps {
  value: string;
  onChange: (formatted: string) => void;
}

function createDefaultWeek(): DaySchedule[] {
  return DAY_LABELS.map(() => ({
    closed: false,
    slots: [{ start: '09:00', end: '21:00' }],
  }));
}

function buildWeeklySummary(
  mode: HoursMode,
  dailyStart: string,
  dailyEnd: string,
  week: DaySchedule[]
): { formatted: string; previewLines: string[] } {
  if (mode === '24h') {
    return {
      formatted: '每日 00:00-24:00 (24 小時營業)',
      previewLines: DAY_LABELS.map((d) => `${d}：00:00–24:00 (24 小時)`),
    };
  }
  if (mode === 'daily_same') {
    const s = dailyStart.trim() || '09:00';
    const e = dailyEnd.trim() || '21:00';
    const overnight = s > e ? '（跨午夜）' : '';
    return {
      formatted: `每日 ${s}-${e}${overnight}`,
      previewLines: DAY_LABELS.map((d) => `${d}：${s}–${e}${overnight}`),
    };
  }
  const lines = week.map((day, idx) => {
    if (day.closed || day.slots.length === 0) return `${DAY_LABELS[idx]}：公休`;
    const slotStr = day.slots
      .map((sl) => `${sl.start.trim() || '09:00'}–${sl.end.trim() || '21:00'}`)
      .join('、');
    return `${DAY_LABELS[idx]}：${slotStr}`;
  });
  return {
    formatted: lines.join('；'),
    previewLines: lines,
  };
}

/**
 * P3 #12：三種結構化營業時間輸入方式 + 完整每週預覽
 * - 選項 A：24 小時營業（自動 00:00–24:00）
 * - 選項 B：每日營業時間相同（支援跨午夜如 18:00–02:00）
 * - 選項 C：自訂每日營業時間（支援公休、多時段如 11:30–14:00 / 17:30–21:00、複製前一天）
 */
export const OpeningHoursPicker: React.FC<OpeningHoursPickerProps> = ({ value, onChange }) => {
  const [mode, setMode] = useState<HoursMode>(() =>
    value.includes('24') ? '24h' : value.includes('週一') ? 'custom' : 'daily_same'
  );
  const [dailyStart, setDailyStart] = useState('09:00');
  const [dailyEnd, setDailyEnd] = useState('21:00');
  const [week, setWeek] = useState<DaySchedule[]>(createDefaultWeek);
  const [selectedDayIdx, setSelectedDayIdx] = useState(0);

  const summary = buildWeeklySummary(mode, dailyStart, dailyEnd, week);

  useEffect(() => {
    onChange(summary.formatted);
  }, [mode, dailyStart, dailyEnd, week]);

  const updateDaySlot = (dayIdx: number, slotIdx: number, field: 'start' | 'end', val: string) => {
    setWeek((prev) =>
      prev.map((d, i) =>
        i !== dayIdx
          ? d
          : {
              ...d,
              slots: d.slots.map((sl, si) => (si === slotIdx ? { ...sl, [field]: val } : sl)),
            }
      )
    );
  };

  const addDaySlot = (dayIdx: number) => {
    setWeek((prev) =>
      prev.map((d, i) =>
        i !== dayIdx || d.slots.length >= 3
          ? d
          : { ...d, closed: false, slots: [...d.slots, { start: '17:30', end: '21:00' }] }
      )
    );
  };

  const removeDaySlot = (dayIdx: number, slotIdx: number) => {
    setWeek((prev) =>
      prev.map((d, i) =>
        i !== dayIdx
          ? d
          : { ...d, slots: d.slots.filter((_, si) => si !== slotIdx) }
      )
    );
  };

  const copyPrevDay = (dayIdx: number) => {
    const srcIdx = dayIdx === 0 ? 6 : dayIdx - 1;
    setWeek((prev) => {
      const src = prev[srcIdx];
      return prev.map((d, i) =>
        i !== dayIdx
          ? d
          : { closed: src.closed, slots: src.slots.map((sl) => ({ ...sl })) }
      );
    });
  };

  const applyToAllDays = (dayIdx: number) => {
    setWeek((prev) => {
      const src = prev[dayIdx];
      return prev.map(() => ({
        closed: src.closed,
        slots: src.slots.map((sl) => ({ ...sl })),
      }));
    });
  };

  const activeDay = week[selectedDayIdx];

  return (
    <View style={styles.wrap}>
      {/* 三種模式切換 */}
      <View style={styles.modeRow}>
        {[
          { key: '24h' as HoursMode, label: '24 小時營業' },
          { key: 'daily_same' as HoursMode, label: '每日相同' },
          { key: 'custom' as HoursMode, label: '自訂每日' },
        ].map((item) => {
          const active = mode === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.modeBtn, active && styles.modeBtnActive]}
              onPress={() => setMode(item.key)}
            >
              <Text style={[styles.modeBtnText, active && styles.modeBtnTextActive]}>
                {item.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {mode === '24h' && (
        <View style={styles.infoBox}>
          <Ionicons name="time-outline" size={16} color="#047857" />
          <Text style={styles.infoText}>已自動套用週一至週日 00:00–24:00（24 小時營業）</Text>
        </View>
      )}

      {mode === 'daily_same' && (
        <View style={styles.sameBox}>
          <View style={styles.timeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>開始時間</Text>
              <TextInput
                style={styles.timeInput}
                value={dailyStart}
                onChangeText={setDailyStart}
                placeholder="09:00"
                placeholderTextColor="#9CA3AF"
              />
            </View>
            <Text style={styles.dash}>—</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.subLabel}>結束時間（支援跨午夜）</Text>
              <TextInput
                style={styles.timeInput}
                value={dailyEnd}
                onChangeText={setDailyEnd}
                placeholder="21:00 或 02:00"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>
          <Text style={styles.hint}>
            自動套用星期一至星期日；若結束時間早於開始時間（如 18:00–02:00）將自動標記跨午夜營業。
          </Text>
        </View>
      )}

      {mode === 'custom' && (
        <View style={styles.customBox}>
          {/* 星期選擇列 */}
          <View style={styles.dayTabsRow}>
            {DAY_LABELS.map((lbl, idx) => {
              const sel = selectedDayIdx === idx;
              const isClosed = week[idx].closed;
              return (
                <TouchableOpacity
                  key={lbl}
                  style={[
                    styles.dayTab,
                    sel && styles.dayTabActive,
                    isClosed && !sel && styles.dayTabClosed,
                  ]}
                  onPress={() => setSelectedDayIdx(idx)}
                >
                  <Text
                    style={[
                      styles.dayTabText,
                      sel && styles.dayTabTextActive,
                      isClosed && !sel && { color: '#9CA3AF' },
                    ]}
                  >
                    {lbl.replace('週', '')}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* 單日設定 */}
          <View style={styles.dayEditorHeader}>
            <Text style={styles.dayEditorTitle}>{DAY_LABELS[selectedDayIdx]} 營業設定</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 12, color: '#6B7280' }}>公休</Text>
              <Switch
                value={activeDay.closed}
                onValueChange={(val) =>
                  setWeek((prev) =>
                    prev.map((d, i) => (i === selectedDayIdx ? { ...d, closed: val } : d))
                  )
                }
                trackColor={{ false: '#E5E7EB', true: '#F472B6' }}
              />
            </View>
          </View>

          {!activeDay.closed && (
            <View style={{ gap: 8 }}>
              {activeDay.slots.map((sl, sIdx) => (
                <View key={sIdx} style={styles.timeRow}>
                  <TextInput
                    style={[styles.timeInput, { flex: 1 }]}
                    value={sl.start}
                    onChangeText={(v) => updateDaySlot(selectedDayIdx, sIdx, 'start', v)}
                    placeholder="11:30"
                  />
                  <Text style={styles.dash}>–</Text>
                  <TextInput
                    style={[styles.timeInput, { flex: 1 }]}
                    value={sl.end}
                    onChangeText={(v) => updateDaySlot(selectedDayIdx, sIdx, 'end', v)}
                    placeholder="14:00"
                  />
                  {activeDay.slots.length > 1 && (
                    <TouchableOpacity onPress={() => removeDaySlot(selectedDayIdx, sIdx)}>
                      <Ionicons name="trash-outline" size={18} color="#DC2626" />
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {activeDay.slots.length < 3 && (
                <TouchableOpacity style={styles.addSlotBtn} onPress={() => addDaySlot(selectedDayIdx)}>
                  <Ionicons name="add-circle-outline" size={15} color="#DB2777" />
                  <Text style={styles.addSlotText}>新增時段（如午／晚餐分開營業）</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={styles.copyRow}>
            <TouchableOpacity style={styles.copyBtn} onPress={() => copyPrevDay(selectedDayIdx)}>
              <Text style={styles.copyBtnText}>複製前一天</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.copyBtn} onPress={() => applyToAllDays(selectedDayIdx)}>
              <Text style={styles.copyBtnText}>套用至每日</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* 送出前完整每週營業時間預覽 */}
      <View style={styles.previewBox}>
        <Text style={styles.previewTitle}>每週營業時間預覽（送出前確認）</Text>
        {summary.previewLines.map((line, i) => (
          <Text key={i} style={styles.previewLine}>
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
    marginTop: 4,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 6,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: '#DB2777',
  },
  modeBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
  },
  modeBtnTextActive: {
    color: '#FFFFFF',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    padding: 10,
    borderRadius: 10,
  },
  infoText: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '600',
    flex: 1,
  },
  sameBox: {
    backgroundColor: '#F9FAFB',
    padding: 10,
    borderRadius: 12,
    gap: 6,
  },
  customBox: {
    backgroundColor: '#F9FAFB',
    padding: 10,
    borderRadius: 12,
    gap: 10,
  },
  subLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 4,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    color: '#111827',
    fontWeight: '600',
  },
  dash: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '700',
  },
  hint: {
    fontSize: 11,
    color: '#6B7280',
  },
  dayTabsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  dayTab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
  },
  dayTabActive: {
    backgroundColor: '#DB2777',
    borderColor: '#DB2777',
  },
  dayTabClosed: {
    backgroundColor: '#F3F4F6',
  },
  dayTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
  },
  dayTabTextActive: {
    color: '#FFFFFF',
  },
  dayEditorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dayEditorTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1F2937',
  },
  addSlotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  addSlotText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DB2777',
  },
  copyRow: {
    flexDirection: 'row',
    gap: 8,
  },
  copyBtn: {
    flex: 1,
    backgroundColor: '#FCE7F3',
    paddingVertical: 6,
    borderRadius: 8,
    alignItems: 'center',
  },
  copyBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9D174D',
  },
  previewBox: {
    backgroundColor: '#FFF5F9',
    borderWidth: 1,
    borderColor: '#FBCFE8',
    borderRadius: 10,
    padding: 10,
    gap: 2,
  },
  previewTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9D174D',
    marginBottom: 4,
  },
  previewLine: {
    fontSize: 11,
    color: '#374151',
  },
});
