import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE, fetchWithTimeout } from '../services/api';

const TRIP_HISTORY_KEY = 'goba_trip_history_v1';
const PARKING_SPOT_KEY = 'goba_saved_parking_spot_v1';
const NAV_CURSOR_SKIN_KEY = 'goba_nav_cursor_skin_v1';

// ==================== 第 24 項：導航圖示個人化 ====================
export type NavCursorSkin = 'arrow' | 'goba_pink' | 'moto' | 'car';

export const NAV_CURSOR_SKINS: { id: NavCursorSkin; label: string; icon: string; color: string }[] = [
  { id: 'arrow', label: '標準箭頭', icon: 'navigate', color: '#EC4899' },
  { id: 'goba_pink', label: '鍋巴粉車', icon: 'heart-circle', color: '#DB2777' },
  { id: 'moto', label: '重機騎士', icon: 'bicycle', color: '#EA580C' },
  { id: 'car', label: '科技座駕', icon: 'car-sport', color: '#2563EB' },
];

export async function loadNavCursorSkin(): Promise<NavCursorSkin> {
  try {
    const v = await AsyncStorage.getItem(NAV_CURSOR_SKIN_KEY);
    if (v === 'arrow' || v === 'goba_pink' || v === 'moto' || v === 'car') return v;
  } catch {
    // ignore
  }
  return 'arrow';
}

export async function saveNavCursorSkin(skin: NavCursorSkin): Promise<void> {
  await AsyncStorage.setItem(NAV_CURSOR_SKIN_KEY, skin).catch(() => {});
}

// ==================== 第 34 項：停車位置記錄 ====================
export interface SavedParkingSpot {
  lat: number;
  lon: number;
  note: string;
  savedAt: number;
}

export async function loadSavedParking(): Promise<SavedParkingSpot | null> {
  try {
    const raw = await AsyncStorage.getItem(PARKING_SPOT_KEY);
    return raw ? (JSON.parse(raw) as SavedParkingSpot) : null;
  } catch {
    return null;
  }
}

export async function saveParkingSpot(spot: SavedParkingSpot): Promise<void> {
  await AsyncStorage.setItem(PARKING_SPOT_KEY, JSON.stringify(spot)).catch(() => {});
}

export async function clearParkingSpot(): Promise<void> {
  await AsyncStorage.removeItem(PARKING_SPOT_KEY).catch(() => {});
}

// ==================== 第 32 項：行程紀錄與 GPX 匯出 ====================
export interface TripTrackPoint {
  lat: number;
  lon: number;
  ts: number;
  speedKmh?: number;
}

export interface TripRecord {
  id: string;
  destName: string;
  startedAt: number;
  endedAt: number;
  distanceKm: number;
  movingSec: number;
  stoppedSec: number;
  points: TripTrackPoint[];
}

export async function loadTripHistory(): Promise<TripRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(TRIP_HISTORY_KEY);
    return raw ? (JSON.parse(raw) as TripRecord[]) : [];
  } catch {
    return [];
  }
}

export async function appendTripRecord(rec: TripRecord): Promise<TripRecord[]> {
  const prev = await loadTripHistory();
  const next = [rec, ...prev].slice(0, 25);
  await AsyncStorage.setItem(TRIP_HISTORY_KEY, JSON.stringify(next)).catch(() => {});
  return next;
}

export function buildTripGpxXml(trip: TripRecord): string {
  const trkpts = trip.points
    .map(
      (p) =>
        `      <trkpt lat="${p.lat.toFixed(6)}" lon="${p.lon.toFixed(6)}"><time>${new Date(
          p.ts
        ).toISOString()}</time></trkpt>`
    )
    .join('\n');
  const safeName = trip.destName.replace(/[<>&'"]/g, '');
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="GOBA Maps" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>前往 ${safeName}</name>
    <trkseg>
${trkpts}
    </trkseg>
  </trk>
</gpx>`;
}

// ==================== 第 16 項：社群交通回報 ====================
export type CommunityCategory =
  | 'accident'
  | 'roadwork'
  | 'police'
  | 'congestion'
  | 'hazard'
  | 'speed_camera';

export interface CommunityReport {
  id: number;
  category: CommunityCategory;
  lat: number;
  lon: number;
  road_name: string;
  note: string;
  upvotes: number;
  downvotes: number;
  distance_m: number;
  age_min: number;
}

export async function fetchCommunityReports(lat: number, lon: number): Promise<CommunityReport[]> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/maps/community/reports?lat=${lat}&lon=${lon}&radius_km=20`,
      undefined,
      6000
    );
    const json = await res.json().catch(() => null);
    return Array.isArray(json?.reports) ? json.reports : [];
  } catch {
    return [];
  }
}

export async function submitCommunityReport(params: {
  category: CommunityCategory;
  lat: number;
  lon: number;
  roadName?: string;
  note?: string;
}): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/maps/community/report`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: params.category,
          lat: params.lat,
          lon: params.lon,
          road_name: params.roadName,
          note: params.note,
        }),
      },
      6000
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function voteCommunityReport(reportId: number, action: 'confirm' | 'dismiss'): Promise<void> {
  await fetchWithTimeout(
    `${API_BASE}/api/maps/community/vote`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_id: reportId, action }),
    },
    5000
  ).catch(() => {});
}

// ==================== 第 15/33 項：OSM 測速照相點位 ====================
export interface SpeedCameraNode {
  id: string;
  lat: number;
  lon: number;
  speed_limit_kmh: number | null;
  camera_type?: 'fixed' | 'section' | 'tech_enforcement';
  direction_text?: string;
  bearing_deg?: number | null;
  road_name?: string;
  city?: string;
  district?: string;
  source: string;
}

export async function fetchSpeedCameras(bbox: {
  minLat: number;
  minLon: number;
  maxLat: number;
  maxLon: number;
}): Promise<{ cameras: SpeedCameraNode[]; source: string }> {
  try {
    const url = `${API_BASE}/api/maps/speed-cameras?min_lat=${bbox.minLat}&min_lon=${bbox.minLon}&max_lat=${bbox.maxLat}&max_lon=${bbox.maxLon}`;
    const res = await fetchWithTimeout(url, undefined, 7000);
    const json = await res.json().catch(() => null);
    return {
      cameras: Array.isArray(json?.cameras) ? json.cameras : [],
      source: String(json?.source || 'OSM'),
    };
  } catch {
    return { cameras: [], source: '離線' };
  }
}

// ==================== 第 28 項：旅程即時分享連結 ====================
export async function createTripShare(params: {
  nickname: string;
  destName: string;
  destLat: number;
  destLon: number;
  lat: number;
  lon: number;
  etaSec: number;
  remainingKm: number;
}): Promise<{ token: string; shareUrl: string } | null> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/maps/trip-share/create`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nickname: params.nickname,
          dest_name: params.destName,
          dest_lat: params.destLat,
          dest_lon: params.destLon,
          lat: params.lat,
          lon: params.lon,
          eta_sec: params.etaSec,
          remaining_km: params.remainingKm,
        }),
      },
      7000
    );
    const json = await res.json().catch(() => null);
    if (res.ok && json?.token) {
      return { token: json.token, shareUrl: json.share_url };
    }
    return null;
  } catch {
    return null;
  }
}

export async function updateTripShare(params: {
  token: string;
  lat: number;
  lon: number;
  etaSec: number;
  remainingKm: number;
}): Promise<void> {
  await fetchWithTimeout(
    `${API_BASE}/api/maps/trip-share/update`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: params.token,
        lat: params.lat,
        lon: params.lon,
        eta_sec: params.etaSec,
        remaining_km: params.remainingKm,
      }),
    },
    5000
  ).catch(() => {});
}

export async function revokeTripShare(token: string): Promise<void> {
  await fetchWithTimeout(
    `${API_BASE}/api/maps/trip-share/revoke`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    },
    5000
  ).catch(() => {});
}

// ==================== 第 30 項：GOBA 智慧語音指令解析 ====================
export type ParsedVoiceCommand =
  | { type: 'navigate'; query: string }
  | { type: 'nearby'; category: string }
  | { type: 'fleet_alert'; text: string }
  | { type: 'save_parking' }
  | { type: 'search'; query: string };

export function parseGobaVoiceCommand(rawText: string): ParsedVoiceCommand {
  const txt = rawText.trim();
  if (/停車|記住車位|停好車/.test(txt)) {
    return { type: 'save_parking' };
  }
  if (/車隊|通知隊友|告訴隊友/.test(txt)) {
    const clean = txt.replace(/^(車隊|通知隊友|告訴隊友)[：:，,\s]*/, '').trim();
    return { type: 'fleet_alert', text: clean || '請注意前方路況' };
  }
  if (/附近|找/.test(txt) && /(加油站|停車場|超商|美食|充電站)/.test(txt)) {
    const m = txt.match(/(加油站|停車場|超商|美食|充電站)/);
    return { type: 'nearby', category: m ? m[1] : '停車場' };
  }
  if (/^(導航到|帶我去|前往|去)/.test(txt)) {
    const q = txt.replace(/^(導航到|帶我去|前往|去)\s*/, '').trim();
    return { type: 'navigate', query: q || txt };
  }
  return { type: 'search', query: txt };
}
