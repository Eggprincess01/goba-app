import React, { useState } from 'react';
import {
  Modal,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  buildTripGpxXml,
  CommunityCategory,
  NAV_CURSOR_SKINS,
  NavCursorSkin,
  SavedParkingSpot,
  TripRecord,
} from '../../navigation/extras';

interface ExtrasModalProps {
  visible: boolean;
  isNight: boolean;
  onClose: () => void;
  cursorSkin: NavCursorSkin;
  onSelectCursorSkin: (skin: NavCursorSkin) => void;
  savedParking: SavedParkingSpot | null;
  onSaveParkingNow: () => void;
  onNavigateToParking: (spot: SavedParkingSpot) => void;
  onClearParking: () => void;
  tripHistory: TripRecord[];
  onSubmitReport: (cat: CommunityCategory) => void;
  onRunVoiceCommand: (text: string) => void;
  activeShareUrl: string | null;
  onToggleTripShare: () => void;
}

const REPORT_ITEMS: { cat: CommunityCategory; label: string; icon: string; color: string }[] = [
  { cat: 'speed_camera', label: '測速照相', icon: 'camera', color: '#DC2626' },
  { cat: 'police', label: '警察臨檢', icon: 'shield', color: '#2563EB' },
  { cat: 'accident', label: '交通事故', icon: 'warning', color: '#EA580C' },
  { cat: 'roadwork', label: '道路施工', icon: 'construct', color: '#D97706' },
  { cat: 'congestion', label: '嚴重塞車', icon: 'car', color: '#7C3AED' },
  { cat: 'hazard', label: '路面障礙', icon: 'alert-circle', color: '#475569' },
];

export const ExtrasModal: React.FC<ExtrasModalProps> = ({
  visible,
  isNight,
  onClose,
  cursorSkin,
  onSelectCursorSkin,
  savedParking,
  onSaveParkingNow,
  onNavigateToParking,
  onClearParking,
  tripHistory,
  onSubmitReport,
  onRunVoiceCommand,
  activeShareUrl,
  onToggleTripShare,
}) => {
  const [voiceInput, setVoiceInput] = useState('');
  const bg = isNight ? '#0F172A' : '#FFFFFF';
  const cardBg = isNight ? '#1E293B' : '#F8FAFC';
  const textMain = isNight ? '#F8FAFC' : '#0F172A';
  const textSub = isNight ? '#94A3B8' : '#64748B';

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={[s.sheet, { backgroundColor: bg }]}>
          <View style={s.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="sparkles" size={20} color="#EC4899" />
              <Text style={[s.title, { color: textMain }]}>GOBA 進階工具箱</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close-circle" size={26} color={textSub} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
            {/* 第 30 項：GOBA 智慧語音指令 */}
            <View style={[s.card, { backgroundColor: cardBg }]}>
              <Text style={[s.label, { color: textMain }]}>GOBA 智慧語音／自然語意指令</Text>
              <Text style={{ fontSize: 11, color: textSub }}>
                可使用鍵盤麥克風聽寫輸入：「導航到台北車站」、「找附近停車場」、「記住車位」、「通知隊友前方集合」
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={voiceInput}
                  onChangeText={setVoiceInput}
                  placeholder="輸入或使用鍵盤語音聽寫..."
                  placeholderTextColor={textSub}
                  style={[s.input, { flex: 1, color: textMain, borderColor: isNight ? '#334155' : '#CBD5E1' }]}
                />
                <TouchableOpacity
                  style={s.pinkBtn}
                  onPress={() => {
                    if (!voiceInput.trim()) return;
                    onRunVoiceCommand(voiceInput.trim());
                    setVoiceInput('');
                    onClose();
                  }}
                >
                  <Text style={s.pinkBtnText}>執行</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 第 16 項：社群交通回報 */}
            <View style={[s.card, { backgroundColor: cardBg }]}>
              <Text style={[s.label, { color: textMain }]}>即時路況回報（目前位置）</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {REPORT_ITEMS.map((item) => (
                  <TouchableOpacity
                    key={item.cat}
                    style={[s.reportChip, { backgroundColor: item.color }]}
                    onPress={() => {
                      onSubmitReport(item.cat);
                      onClose();
                    }}
                  >
                    <Ionicons name={item.icon as any} size={14} color="#FFF" />
                    <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '800' }}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* 第 28 項：旅程即時分享連結 */}
            <View style={[s.card, { backgroundColor: cardBg }]}>
              <Text style={[s.label, { color: textMain }]}>旅程即時分享（4 小時有效・可隨時撤銷）</Text>
              <TouchableOpacity
                style={[s.pinkBtn, activeShareUrl && { backgroundColor: '#DC2626' }]}
                onPress={onToggleTripShare}
              >
                <Ionicons name={activeShareUrl ? 'stop-circle-outline' : 'share-social'} size={16} color="#FFF" />
                <Text style={s.pinkBtnText}>
                  {activeShareUrl ? '停止並撤銷行程分享' : '產生即時 ETA 分享連結'}
                </Text>
              </TouchableOpacity>
              {activeShareUrl && (
                <Text style={{ fontSize: 11, color: '#10B981', fontWeight: '700' }}>{activeShareUrl}</Text>
              )}
            </View>

            {/* 第 34 項：停車位置記錄 */}
            <View style={[s.card, { backgroundColor: cardBg }]}>
              <Text style={[s.label, { color: textMain }]}>停車位置記憶</Text>
              {savedParking ? (
                <View style={{ gap: 8 }}>
                  <Text style={{ fontSize: 12, color: textSub }}>
                    已記錄於 {new Date(savedParking.savedAt).toLocaleTimeString('zh-TW')}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={[s.pinkBtn, { flex: 1 }]}
                      onPress={() => {
                        onNavigateToParking(savedParking);
                        onClose();
                      }}
                    >
                      <Text style={s.pinkBtnText}>導航回愛車</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.outlineBtn, { borderColor: '#DC2626' }]}
                      onPress={onClearParking}
                    >
                      <Text style={{ color: '#DC2626', fontSize: 12, fontWeight: '800' }}>清除</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={s.pinkBtn} onPress={onSaveParkingNow}>
                  <Ionicons name="car" size={16} color="#FFF" />
                  <Text style={s.pinkBtnText}>記住目前停車位置</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* 第 24 項：導航圖示個人化 */}
            <View style={[s.card, { backgroundColor: cardBg }]}>
              <Text style={[s.label, { color: textMain }]}>導航車標圖示個人化</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {NAV_CURSOR_SKINS.map((skin) => {
                  const active = cursorSkin === skin.id;
                  return (
                    <TouchableOpacity
                      key={skin.id}
                      onPress={() => onSelectCursorSkin(skin.id)}
                      style={[
                        s.skinChip,
                        {
                          borderColor: active ? skin.color : isNight ? '#334155' : '#CBD5E1',
                          backgroundColor: active ? `${skin.color}22` : 'transparent',
                        },
                      ]}
                    >
                      <Ionicons name={skin.icon as any} size={15} color={skin.color} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: textMain }}>{skin.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* 第 32 項：行程紀錄與 GPX 匯出 */}
            <View style={[s.card, { backgroundColor: cardBg }]}>
              <Text style={[s.label, { color: textMain }]}>
                最近行程紀錄與 GPX 匯出（{tripHistory.length} 筆）
              </Text>
              {tripHistory.length === 0 ? (
                <Text style={{ fontSize: 12, color: textSub }}>
                  完成導航後將自動記錄行駛里程、移動／停止時間並可匯出 GPX。
                </Text>
              ) : (
                tripHistory.slice(0, 5).map((t) => (
                  <View key={t.id} style={s.tripRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: '700', color: textMain }} numberOfLines={1}>
                        前往 {t.destName}
                      </Text>
                      <Text style={{ fontSize: 11, color: textSub }}>
                        {t.distanceKm.toFixed(1)} km · 移動 {Math.round(t.movingSec / 60)}分 · 停止 {Math.round(t.stoppedSec / 60)}分
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[s.outlineBtn, { borderColor: '#EC4899' }]}
                      onPress={() =>
                        Share.share({
                          title: `${t.destName}.gpx`,
                          message: buildTripGpxXml(t),
                        }).catch(() => {})
                      }
                    >
                      <Text style={{ color: '#EC4899', fontSize: 11, fontWeight: '800' }}>匯出 GPX</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, gap: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '800' },
  card: { padding: 14, borderRadius: 16, gap: 10 },
  label: { fontSize: 14, fontWeight: '800' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13 },
  pinkBtn: {
    backgroundColor: '#EC4899',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pinkBtnText: { color: '#FFF', fontSize: 13, fontWeight: '800' },
  outlineBtn: { borderWidth: 1.5, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 12, justifyContent: 'center' },
  reportChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10 },
  skinChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1.5 },
  tripRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(148,163,184,0.25)' },
});
