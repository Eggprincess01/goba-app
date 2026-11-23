import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioModule,
  createAudioPlayer,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE, fetchWithTimeout } from '../services/api';
import { GpsSnapshot, VehicleClassId } from './types';

const FLEET_MEMBER_ID_KEY = 'goba_fleet_member_id_v1';
const FLEET_ACTIVE_CODE_KEY = 'goba_fleet_active_code_v1';
const FLEET_NICKNAME_KEY = 'goba_fleet_nickname_v1';

export type FleetVoiceMode = 'open' | 'ptt' | 'leader_only';

export interface FleetMember {
  member_id: string;
  nickname: string;
  vehicle_type: VehicleClassId;
  is_leader: boolean;
  share_location: boolean;
  lat: number | null;
  lon: number | null;
  heading: number | null;
  speed_kmh: number | null;
  updated_at: number;
  stale_sec: number;
  distance_from_leader_m: number | null;
  is_lagging: boolean;
}

export interface FleetVoiceMessage {
  id: number;
  sender_id: string;
  sender_name: string;
  is_leader: boolean;
  msg_type: 'ptt' | 'alert';
  text?: string | null;
  audio_b64?: string | null;
  mime_type?: string;
  duration_ms: number;
  created_at: number;
}

export interface FleetRoomState {
  code: string;
  name: string;
  leader_id: string;
  voice_mode: FleetVoiceMode;
  join_url: string;
  destination: { name: string; address: string; lat: number; lon: number } | null;
  rally_point: { name: string; lat: number; lon: number } | null;
  members: FleetMember[];
  voice_messages: FleetVoiceMessage[];
  server_time: number;
}

async function postFleetJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetchWithTimeout(
    `${API_BASE}${path}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
    10000
  );
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    throw new Error(data?.detail || '車隊連線失敗，請確認網路後再試');
  }
  return data as T;
}

async function audioUriToBase64(uri: string): Promise<string> {
  const res = await fetch(uri);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('語音讀取失敗'));
    reader.onloadend = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.readAsDataURL(blob);
  });
}

async function setFleetAudioMode(mode: 'record' | 'duck_play' | 'mix'): Promise<void> {
  try {
    await setAudioModeAsync({
      allowsRecording: mode === 'record',
      playsInSilentMode: true,
      shouldPlayInBackground: mode !== 'mix',
      interruptionMode: mode === 'duck_play' ? 'duckOthers' : 'mixWithOthers',
      shouldRouteThroughEarpiece: false,
    });
  } catch {
    // ignore on unsupported devices
  }
}

export function useFleetMode(options: {
  gps: GpsSnapshot | null;
  vehicleType: VehicleClassId;
}) {
  const [memberId, setMemberId] = useState<string>('');
  const [nickname, setNickname] = useState<string>('鍋巴車友');
  const [fleet, setFleet] = useState<FleetRoomState | null>(null);
  const [shareLocation, setShareLocation] = useState<boolean>(true);
  const [isRecordingPtt, setIsRecordingPtt] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const recordingRef = useRef<InstanceType<typeof AudioModule.AudioRecorder> | null>(null);
  const recordStartTsRef = useRef<number>(0);
  const lastMsgIdRef = useRef<number>(0);
  const playedIdsRef = useRef<Set<number>>(new Set());
  const gpsRef = useRef<GpsSnapshot | null>(options.gps);
  gpsRef.current = options.gps;
  const vehicleRef = useRef<VehicleClassId>(options.vehicleType);
  vehicleRef.current = options.vehicleType;
  const shareRef = useRef<boolean>(shareLocation);
  shareRef.current = shareLocation;

  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(FLEET_MEMBER_ID_KEY),
      AsyncStorage.getItem(FLEET_NICKNAME_KEY),
      AsyncStorage.getItem(FLEET_ACTIVE_CODE_KEY),
    ])
      .then(async ([savedId, savedNick, savedCode]) => {
        const uid = savedId || `gb-${Math.random().toString(36).slice(2, 10)}`;
        if (!savedId) {
          AsyncStorage.setItem(FLEET_MEMBER_ID_KEY, uid).catch(() => {});
        }
        setMemberId(uid);
        const nick = savedNick || '鍋巴車友';
        if (savedNick) setNickname(savedNick);
        if (savedCode) {
          try {
            const rejoined = await postFleetJson<FleetRoomState>('/api/maps/fleet/join', {
              code: savedCode,
              member_id: uid,
              nickname: nick,
              vehicle_type: vehicleRef.current,
            });
            for (const m of rejoined.voice_messages || []) {
              playedIdsRef.current.add(m.id);
              if (m.id > lastMsgIdRef.current) lastMsgIdRef.current = m.id;
            }
            setFleet(rejoined);
          } catch {
            // 若房間已不存在才清除快取
            AsyncStorage.removeItem(FLEET_ACTIVE_CODE_KEY).catch(() => {});
          }
        }
      })
      .catch(() => {
        setMemberId(`gb-${Math.random().toString(36).slice(2, 10)}`);
      });
  }, []);

  const playIncomingMessages = useCallback(
    async (msgs: FleetVoiceMessage[], myId: string) => {
      for (const msg of msgs) {
        if (msg.id > lastMsgIdRef.current) {
          lastMsgIdRef.current = msg.id;
        }
        if (playedIdsRef.current.has(msg.id) || msg.sender_id === myId) {
          continue;
        }
        playedIdsRef.current.add(msg.id);

        if (msg.msg_type === 'alert' && msg.text) {
          await setFleetAudioMode('duck_play');
          Speech.speak(`車隊通知：${msg.sender_name}說，${msg.text}`, {
            language: 'zh-TW',
            onDone: () => void setFleetAudioMode('mix'),
            onStopped: () => void setFleetAudioMode('mix'),
            onError: () => void setFleetAudioMode('mix'),
          });
        } else if (msg.audio_b64) {
          try {
            await setFleetAudioMode('duck_play');
            const dataUri = `data:${msg.mime_type || 'audio/m4a'};base64,${msg.audio_b64}`;
            const player = createAudioPlayer({ uri: dataUri });
            const sub = player.addListener('playbackStatusUpdate', (status) => {
              if (status.didJustFinish) {
                sub.remove();
                player.remove();
                void setFleetAudioMode('mix');
              }
            });
            player.play();
          } catch {
            void setFleetAudioMode('mix');
          }
        }
      }
    },
    []
  );

  // 每 3.5 秒同步一次車隊位置與 PTT 語音訊息
  useEffect(() => {
    if (!fleet?.code || !memberId) return;
    const timer = setInterval(async () => {
      try {
        const g = gpsRef.current;
        const speedKmh =
          g?.speedMps != null && g.speedMps >= 0 ? Math.round(g.speedMps * 3.6) : null;
        const next = await postFleetJson<FleetRoomState>('/api/maps/fleet/heartbeat', {
          code: fleet.code,
          member_id: memberId,
          vehicle_type: vehicleRef.current,
          share_location: shareRef.current,
          lat: shareRef.current && g ? g.lat : null,
          lon: shareRef.current && g ? g.lon : null,
          heading: shareRef.current && g ? g.headingDeg : null,
          speed_kmh: shareRef.current ? speedKmh : null,
          since_msg_id: lastMsgIdRef.current,
        });
        setFleet((prev) => ({
          ...next,
          voice_messages:
            next.voice_messages.length > 0
              ? next.voice_messages
              : prev?.voice_messages ?? [],
        }));
        if (next.voice_messages.length > 0) {
          void playIncomingMessages(next.voice_messages, memberId);
        }
      } catch {
        // 網路短暫波動時略過，下次心跳自動重連
      }
    }, 3500);
    return () => clearInterval(timer);
  }, [fleet?.code, memberId, playIncomingMessages]);

  const createFleet = useCallback(
    async (
      customNickname?: string,
      dest?: { name: string; address: string; lat: number; lon: number } | null
    ) => {
      if (!memberId) return null;
      setBusy(true);
      setError(null);
      try {
        const nick = (customNickname || nickname).trim() || '隊長';
        setNickname(nick);
        AsyncStorage.setItem(FLEET_NICKNAME_KEY, nick).catch(() => {});
        lastMsgIdRef.current = 0;
        playedIdsRef.current.clear();
        const created = await postFleetJson<FleetRoomState>('/api/maps/fleet/create', {
          member_id: memberId,
          nickname: nick,
          vehicle_type: vehicleRef.current,
          dest_name: dest?.name,
          dest_address: dest?.address,
          dest_lat: dest?.lat,
          dest_lon: dest?.lon,
        });
        AsyncStorage.setItem(FLEET_ACTIVE_CODE_KEY, created.code).catch(() => {});
        setFleet(created);
        return created;
      } catch (e: any) {
        setError(e?.message || '建立車隊失敗');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [memberId, nickname]
  );

  const joinFleet = useCallback(
    async (codeInput: string, customNickname?: string) => {
      if (!memberId) return null;
      setBusy(true);
      setError(null);
      try {
        const nick = (customNickname || nickname).trim() || '隊友';
        setNickname(nick);
        AsyncStorage.setItem(FLEET_NICKNAME_KEY, nick).catch(() => {});
        lastMsgIdRef.current = 0;
        playedIdsRef.current.clear();
        const joined = await postFleetJson<FleetRoomState>('/api/maps/fleet/join', {
          code: codeInput.trim().toUpperCase(),
          member_id: memberId,
          nickname: nick,
          vehicle_type: vehicleRef.current,
        });
        for (const m of joined.voice_messages || []) {
          playedIdsRef.current.add(m.id);
          if (m.id > lastMsgIdRef.current) lastMsgIdRef.current = m.id;
        }
        AsyncStorage.setItem(FLEET_ACTIVE_CODE_KEY, joined.code).catch(() => {});
        setFleet(joined);
        return joined;
      } catch (e: any) {
        setError(e?.message || '加入車隊失敗');
        return null;
      } finally {
        setBusy(false);
      }
    },
    [memberId, nickname]
  );

  const updateRallyOrDest = useCallback(
    async (params: {
      dest?: { name: string; address: string; lat: number; lon: number };
      rally?: { name: string; lat: number; lon: number };
      voiceMode?: FleetVoiceMode;
    }) => {
      if (!fleet?.code || !memberId) return null;
      try {
        const updated = await postFleetJson<FleetRoomState>('/api/maps/fleet/rally', {
          code: fleet.code,
          member_id: memberId,
          dest_name: params.dest?.name,
          dest_address: params.dest?.address,
          dest_lat: params.dest?.lat,
          dest_lon: params.dest?.lon,
          rally_name: params.rally?.name,
          rally_lat: params.rally?.lat,
          rally_lon: params.rally?.lon,
          voice_mode: params.voiceMode,
        });
        setFleet(updated);
        return updated;
      } catch (e: any) {
        setError(e?.message || '更新車隊設定失敗');
        return null;
      }
    },
    [fleet?.code, memberId]
  );

  const sendTextAlert = useCallback(
    async (text: string) => {
      if (!fleet?.code || !memberId || !text.trim()) return;
      try {
        const updated = await postFleetJson<FleetRoomState>('/api/maps/fleet/ptt', {
          code: fleet.code,
          member_id: memberId,
          sender_name: nickname,
          msg_type: 'alert',
          text: text.trim(),
        });
        setFleet(updated);
      } catch (e: any) {
        setError(e?.message || '發送車隊廣播失敗');
      }
    },
    [fleet?.code, memberId, nickname]
  );

  const startPttRecording = useCallback(async () => {
    if (!fleet?.code || isRecordingPtt) return;
    setError(null);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError('請開啟麥克風權限才能使用按鍵對講');
        return;
      }
      await setFleetAudioMode('record');
      const recorder = new AudioModule.AudioRecorder(RecordingPresets.LOW_QUALITY);
      await recorder.prepareToRecordAsync();
      recorder.record();
      recordingRef.current = recorder;
      recordStartTsRef.current = Date.now();
      setIsRecordingPtt(true);
    } catch {
      setIsRecordingPtt(false);
      await setFleetAudioMode('mix');
      setError('無法啟動麥克風錄音');
    }
  }, [fleet?.code, isRecordingPtt]);

  const stopAndSendPtt = useCallback(async () => {
    const rec = recordingRef.current;
    recordingRef.current = null;
    setIsRecordingPtt(false);
    if (!rec || !fleet?.code || !memberId) {
      await setFleetAudioMode('mix');
      return;
    }
    try {
      await rec.stop();
      const durationMs = Math.max(300, Date.now() - recordStartTsRef.current);
      const uri = rec.uri;
      await setFleetAudioMode('mix');
      if (!uri || durationMs < 350) return;
      const b64 = await audioUriToBase64(uri);
      const updated = await postFleetJson<FleetRoomState>('/api/maps/fleet/ptt', {
        code: fleet.code,
        member_id: memberId,
        sender_name: nickname,
        msg_type: 'ptt',
        audio_b64: b64,
        mime_type: 'audio/m4a',
        duration_ms: durationMs,
      });
      setFleet(updated);
    } catch (e: any) {
      await setFleetAudioMode('mix');
      setError(e?.message || '語音送出失敗');
    }
  }, [fleet?.code, memberId, nickname]);

  const leaveFleet = useCallback(async () => {
    const code = fleet?.code;
    setFleet(null);
    lastMsgIdRef.current = 0;
    playedIdsRef.current.clear();
    AsyncStorage.removeItem(FLEET_ACTIVE_CODE_KEY).catch(() => {});
    if (code && memberId) {
      try {
        await postFleetJson('/api/maps/fleet/leave', { code, member_id: memberId });
      } catch {
        // ignore
      }
    }
  }, [fleet?.code, memberId]);

  const isLeader = Boolean(fleet && memberId && fleet.leader_id === memberId);

  return {
    memberId,
    nickname,
    setNickname,
    fleet,
    isLeader,
    shareLocation,
    setShareLocation,
    isRecordingPtt,
    busy,
    error,
    setError,
    createFleet,
    joinFleet,
    updateRallyOrDest,
    sendTextAlert,
    startPttRecording,
    stopAndSendPtt,
    leaveFleet,
  };
}
