import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { FleetRoomState, FleetVoiceMode, SavedFleetRoom } from '../../navigation/fleet';

interface FleetModalProps {
  visible: boolean;
  isNight: boolean;
  onClose: () => void;
  memberId: string;
  nickname: string;
  setNickname: (v: string) => void;
  fleet: FleetRoomState | null;
  savedRooms: SavedFleetRoom[];
  isLeader: boolean;
  shareLocation: boolean;
  setShareLocation: (v: boolean) => void;
  isRecordingPtt: boolean;
  openMicMuted: boolean;
  onToggleOpenMicMute: () => void;
  busy: boolean;
  error: string | null;
  currentDestination: { name: string; address: string; lat: number; lon: number } | null;
  onCreateFleet: (nick: string) => void;
  onJoinFleet: (code: string, nick: string) => void;
  onDisconnectFleet: () => void;
  onLeaveFleet: () => void;
  onStartPtt: () => void;
  onStopPtt: () => void;
  onChangeVoiceMode?: (mode: FleetVoiceMode) => void;
  onSendAlert: (text: string) => void;
  onSyncCurrentDestToFleet: () => void;
  onNavigateToFleetDest: (dest: { name: string; address: string; lat: number; lon: number }) => void;
}

export const FleetModal: React.FC<FleetModalProps> = ({
  visible,
  isNight,
  onClose,
  memberId,
  nickname,
  setNickname,
  fleet,
  savedRooms,
  isLeader,
  shareLocation,
  setShareLocation,
  isRecordingPtt,
  openMicMuted,
  onToggleOpenMicMute,
  busy,
  error,
  currentDestination,
  onCreateFleet,
  onJoinFleet,
  onDisconnectFleet,
  onLeaveFleet,
  onStartPtt,
  onStopPtt,
  onChangeVoiceMode,
  onSendAlert,
  onSyncCurrentDestToFleet,
  onNavigateToFleetDest,
}) => {
  const [joinCode, setJoinCode] = useState('');
  const [showQr, setShowQr] = useState(false);

  const bg = isNight ? '#0F172A' : '#FFFFFF';
  const cardBg = isNight ? '#1E293B' : '#F8FAFC';
  const textMain = isNight ? '#F8FAFC' : '#0F172A';
  const textSub = isNight ? '#94A3B8' : '#64748B';
  const curVoiceMode: FleetVoiceMode = fleet?.voice_mode || 'ptt';
  const canSpeak = curVoiceMode !== 'leader_only' || isLeader;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={s.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[s.sheet, { backgroundColor: bg }]}>
          <View style={s.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Ionicons name="people" size={22} color="#EC4899" />
              <Text style={[s.title, { color: textMain }]}>
                {fleet ? `${fleet.name}` : 'GOBA 車隊模式'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close-circle" size={26} color={textSub} />
            </TouchableOpacity>
          </View>

          {error && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          {!fleet ? (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 24 }}>
              {/* 我的永久車隊對講群（退出連線後依然保留，下次出遊直接點選進入） */}
              {savedRooms.length > 0 && (
                <View style={[s.card, { backgroundColor: cardBg }]}>
                  <Text style={[s.label, { color: textMain }]}>我的車隊對講群</Text>
                  {savedRooms.map((room) => (
                    <TouchableOpacity
                      key={room.code}
                      activeOpacity={0.8}
                      onPress={() => onJoinFleet(room.code, nickname)}
                      style={[
                        s.memberRow,
                        {
                          justifyContent: 'space-between',
                          paddingVertical: 10,
                        },
                      ]}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 15, fontWeight: '800', color: textMain }}>
                            {room.name}
                          </Text>
                          <View style={[s.leaderTag, { backgroundColor: room.voice_mode === 'open' ? '#16A34A' : '#334155' }]}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFF' }}>
                              {room.voice_mode === 'open' ? '自由模式' : room.voice_mode === 'leader_only' ? '僅隊長' : '按鍵說'}
                            </Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 11, color: textSub }} numberOfLines={1}>
                          邀請碼 {room.code} · {room.member_count} 人（{room.member_names.join('、')}）
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color="#EC4899" />
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              <Text style={{ fontSize: 13, color: textSub, lineHeight: 19 }}>
                建立或加入車隊後，房間將永久保留在「我的車隊對講群」，下次出遊點選即可直接重聚。
              </Text>

              <View style={[s.card, { backgroundColor: cardBg }]}>
                <Text style={[s.label, { color: textMain }]}>我的車隊暱稱</Text>
                <TextInput
                  value={nickname}
                  onChangeText={setNickname}
                  placeholder="輸入暱稱（例如：阿偉）"
                  placeholderTextColor={textSub}
                  style={[s.input, { color: textMain, borderColor: isNight ? '#334155' : '#CBD5E1' }]}
                />
                <TouchableOpacity
                  style={s.primaryBtn}
                  disabled={busy}
                  onPress={() => onCreateFleet(nickname)}
                >
                  {busy ? (
                    <ActivityIndicator color="#FFF" />
                  ) : (
                    <>
                      <Ionicons name="add-circle-outline" size={18} color="#FFF" />
                      <Text style={s.primaryBtnText}>建立新車隊（擔任隊長）</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>

              <View style={[s.card, { backgroundColor: cardBg }]}>
                <Text style={[s.label, { color: textMain }]}>輸入 6 碼邀請碼加入車隊</Text>
                <TextInput
                  value={joinCode}
                  onChangeText={(t) => setJoinCode(t.toUpperCase())}
                  placeholder="例如：GB8K2M"
                  placeholderTextColor={textSub}
                  autoCapitalize="characters"
                  maxLength={8}
                  style={[s.input, { color: textMain, borderColor: isNight ? '#334155' : '#CBD5E1' }]}
                />
                <TouchableOpacity
                  style={[s.secondaryBtn, { borderColor: '#EC4899' }]}
                  disabled={busy || joinCode.trim().length < 4}
                  onPress={() => onJoinFleet(joinCode, nickname)}
                >
                  <Ionicons name="enter-outline" size={18} color="#EC4899" />
                  <Text style={[s.secondaryBtnText, { color: '#EC4899' }]}>加入車隊</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
              {/* 邀請碼與 QR */}
              <View style={[s.card, { backgroundColor: cardBg }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={{ fontSize: 11, color: textSub }}>車隊邀請碼</Text>
                    <Text style={{ fontSize: 22, fontWeight: '900', color: '#EC4899', letterSpacing: 2 }}>
                      {fleet.code}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={[s.smallPill, { backgroundColor: isNight ? '#334155' : '#E2E8F0' }]}
                      onPress={() => setShowQr((prev) => !prev)}
                    >
                      <Ionicons name="qr-code-outline" size={16} color={textMain} />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: textMain }}>QR</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.smallPill, { backgroundColor: '#EC4899' }]}
                      onPress={() =>
                        Share.share({
                          message: `加入我的 GOBA 車隊「${fleet.name}」，邀請碼：${fleet.code}\n${fleet.join_url}`,
                        }).catch(() => {})
                      }
                    >
                      <Ionicons name="share-outline" size={16} color="#FFF" />
                      <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFF' }}>邀請</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {showQr && (
                  <View style={{ alignItems: 'center', paddingTop: 10 }}>
                    <Image
                      source={{
                        uri: `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
                          fleet.join_url
                        )}`,
                      }}
                      style={{ width: 150, height: 150, borderRadius: 12, backgroundColor: '#FFF' }}
                    />
                    <Text style={{ fontSize: 11, color: textSub, marginTop: 6 }}>
                      隊友可輸入 {fleet.code} 加入車隊
                    </Text>
                  </View>
                )}
              </View>

              {/* 共同目的地與車種合法獨立導航 */}
              <View style={[s.card, { backgroundColor: cardBg }]}>
                <Text style={[s.label, { color: textMain }]}>車隊目的地</Text>
                {fleet.destination ? (
                  <View style={{ gap: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: textMain }}>
                      {fleet.destination.name}
                    </Text>
                    <TouchableOpacity
                      style={s.primaryBtn}
                      onPress={() => {
                        onNavigateToFleetDest(fleet.destination!);
                        onClose();
                      }}
                    >
                      <Ionicons name="navigate" size={16} color="#FFF" />
                      <Text style={s.primaryBtnText}>依我的車種規劃路線前往</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={{ fontSize: 12, color: textSub }}>
                    隊長尚未設定共同目的地
                  </Text>
                )}
                {isLeader && currentDestination && (
                  <TouchableOpacity
                    style={[s.secondaryBtn, { borderColor: '#16A34A', marginTop: 4 }]}
                    onPress={onSyncCurrentDestToFleet}
                  >
                    <Ionicons name="flag-outline" size={16} color="#16A34A" />
                    <Text style={[s.secondaryBtnText, { color: '#16A34A' }]}>
                      設目前目的地「{currentDestination.name}」為車隊終點
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 同意制位置共享 + PTT 按鍵對講 */}
              <View style={[s.card, { backgroundColor: cardBg }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.label, { color: textMain }]}>同意共享即時位置</Text>
                    <Text style={{ fontSize: 11, color: textSub }}>
                      關閉後隊友將無法看到你的座標與速度
                    </Text>
                  </View>
                  <Switch
                    value={shareLocation}
                    onValueChange={setShareLocation}
                    trackColor={{ false: '#64748B', true: '#EC4899' }}
                  />
                </View>

                {/* 隊長可切換發言模式：自由發言 / 按鍵說話 / 僅隊長發言 */}
                {isLeader && onChangeVoiceMode ? (
                  <View style={{ gap: 6 }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: textSub }}>
                      隊長語音模式控制
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {(
                        [
                          { id: 'open', label: '自由發言' },
                          { id: 'ptt', label: '按鍵說話' },
                          { id: 'leader_only', label: '僅隊長說' },
                        ] as { id: FleetVoiceMode; label: string }[]
                      ).map((opt) => {
                        const active = curVoiceMode === opt.id;
                        return (
                          <TouchableOpacity
                            key={opt.id}
                            onPress={() => onChangeVoiceMode(opt.id)}
                            style={[
                              s.smallPill,
                              {
                                flex: 1,
                                justifyContent: 'center',
                                backgroundColor: active
                                  ? '#EC4899'
                                  : isNight
                                  ? '#334155'
                                  : '#E2E8F0',
                              },
                            ]}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: '800',
                                color: active ? '#FFF' : textMain,
                              }}
                            >
                              {opt.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ) : (
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#EC4899' }}>
                    目前語音模式：
                    {curVoiceMode === 'open'
                      ? '大家皆可自由發言'
                      : curVoiceMode === 'leader_only'
                      ? '僅隊長可發言'
                      : '按鍵說話（PTT）'}
                  </Text>
                )}

                {curVoiceMode === 'open' ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={onToggleOpenMicMute}
                    style={[
                      s.pttBtn,
                      { backgroundColor: openMicMuted ? '#64748B' : '#16A34A' },
                    ]}
                  >
                    <Ionicons name={openMicMuted ? 'mic-off' : 'mic'} size={20} color="#FFF" />
                    <Text style={s.primaryBtnText}>
                      {openMicMuted
                        ? '麥克風已靜音（點一下恢復自由發言）'
                        : '自由通話中・直接說話即可（點此靜音）'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={!canSpeak}
                    onPressIn={onStartPtt}
                    onPressOut={onStopPtt}
                    style={[
                      s.pttBtn,
                      {
                        backgroundColor: !canSpeak
                          ? '#64748B'
                          : isRecordingPtt
                          ? '#DC2626'
                          : '#0F172A',
                      },
                    ]}
                  >
                    <Ionicons name={isRecordingPtt ? 'mic' : 'mic-outline'} size={20} color="#FFF" />
                    <Text style={s.primaryBtnText}>
                      {!canSpeak
                        ? '目前為僅隊長發言模式'
                        : isRecordingPtt
                        ? '錄音中…放開立即送出對講'
                        : '按住說話（車隊 PTT 對講）'}
                    </Text>
                  </TouchableOpacity>
                )}

                {isLeader && (
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={[s.smallPill, { flex: 1, justifyContent: 'center', backgroundColor: '#F59E0B' }]}
                      onPress={() => onSendAlert('請注意前方路口集合')}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFF' }}>
                        廣播：前方集合
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.smallPill, { flex: 1, justifyContent: 'center', backgroundColor: '#0EA5E9' }]}
                      onPress={() => onSendAlert('後方隊友請跟上，注意安全')}
                    >
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#FFF' }}>
                        廣播：注意跟車
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* 隊友清單與落隊狀態 */}
              <View style={[s.card, { backgroundColor: cardBg }]}>
                <Text style={[s.label, { color: textMain }]}>
                  車隊成員（{fleet.members.length} 人）
                </Text>
                {fleet.members.map((m) => (
                  <View key={m.member_id} style={s.memberRow}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ fontSize: 14, fontWeight: '700', color: textMain }}>
                          {m.nickname}
                          {m.member_id === memberId ? '（我）' : ''}
                        </Text>
                        {m.is_leader && (
                          <View style={s.leaderTag}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFF' }}>隊長</Text>
                          </View>
                        )}
                        {m.is_lagging && (
                          <View style={[s.leaderTag, { backgroundColor: '#DC2626' }]}>
                            <Text style={{ fontSize: 10, fontWeight: '800', color: '#FFF' }}>
                              落隊 {m.distance_from_leader_m}m
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ fontSize: 11, color: textSub }}>
                        {m.share_location
                          ? `${m.speed_kmh ?? 0} km/h · ${m.stale_sec}秒前更新`
                          : '已暫停位置分享'}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[s.secondaryBtn, { borderColor: '#EC4899' }]}
                onPress={onDisconnectFleet}
              >
                <Ionicons name="pause-circle-outline" size={18} color="#EC4899" />
                <Text style={[s.secondaryBtnText, { color: '#EC4899' }]}>
                  暫時退出通話（保留車隊群組）
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.secondaryBtn, { borderColor: '#DC2626' }]}
                onPress={onLeaveFleet}
              >
                <Ionicons name="exit-outline" size={18} color="#DC2626" />
                <Text style={[s.secondaryBtnText, { color: '#DC2626' }]}>徹底移出此車隊群組</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '86%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  errorBox: {
    backgroundColor: '#FEE2E2',
    padding: 10,
    borderRadius: 10,
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    padding: 14,
    borderRadius: 16,
    gap: 10,
  },
  label: {
    fontSize: 14,
    fontWeight: '800',
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    fontWeight: '600',
  },
  primaryBtn: {
    backgroundColor: '#EC4899',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  secondaryBtn: {
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  secondaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  smallPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  pttBtn: {
    borderRadius: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148, 163, 184, 0.25)',
  },
  leaderTag: {
    backgroundColor: '#EC4899',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
});
