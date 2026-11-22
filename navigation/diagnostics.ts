import AsyncStorage from '@react-native-async-storage/async-storage';
import { SearchPlace } from './types';

const RECENTS_STORAGE_KEY = 'goba_maps_recents_v1';
const FAVORITES_STORAGE_KEY = 'goba_maps_favorites_v1';
const COMMUTE_ANCHORS_KEY = 'goba_maps_commute_anchors_v1';

export interface CommuteAnchors {
  home: SearchPlace | null;
  work: SearchPlace | null;
}

export type DiagnosticEventType =
  | 'route_ok'
  | 'route_error'
  | 'geocode_error'
  | 'off_route_reroute'
  | 'reroute_failed_offline'
  | 'gps_low_accuracy'
  | 'gps_signal_lost'
  | 'gps_signal_restored'
  | 'app_foreground_resync'
  | 'map_style_fallback'
  | 'speech_error';

export interface PrivacySafeDiagnosticEntry {
  id: string;
  type: DiagnosticEventType;
  code: string;
  latencyMs?: number;
  accuracyBucket?: 'good' | 'fair' | 'poor';
  timestamp: number;
}

// 僅保存在記憶體環狀緩衝區（最多 40 筆），絕不記錄任何經緯度、地址或個人識別資料
const diagnosticBuffer: PrivacySafeDiagnosticEntry[] = [];

export function recordNavDiagnostic(
  type: DiagnosticEventType,
  code: string = 'OK',
  extra?: { latencyMs?: number; accuracyMeters?: number | null }
): void {
  let accuracyBucket: 'good' | 'fair' | 'poor' | undefined;
  if (typeof extra?.accuracyMeters === 'number') {
    accuracyBucket =
      extra.accuracyMeters <= 15 ? 'good' : extra.accuracyMeters <= 45 ? 'fair' : 'poor';
  }
  diagnosticBuffer.unshift({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    code: String(code).slice(0, 48),
    latencyMs: extra?.latencyMs,
    accuracyBucket,
    timestamp: Date.now(),
  });
  if (diagnosticBuffer.length > 40) {
    diagnosticBuffer.length = 40;
  }
}

export function getNavDiagnostics(): PrivacySafeDiagnosticEntry[] {
  return [...diagnosticBuffer];
}

export async function loadRecentSearches(): Promise<SearchPlace[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, 8) : [];
  } catch {
    return [];
  }
}

export async function saveRecentSearch(place: SearchPlace): Promise<SearchPlace[]> {
  try {
    const current = await loadRecentSearches();
    const filtered = current.filter(
      (p) => p.name !== place.name || Math.abs(p.lat - place.lat) > 0.001
    );
    const next = [place, ...filtered].slice(0, 8);
    await AsyncStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export async function loadFavoritePlaces(): Promise<SearchPlace[]> {
  try {
    const raw = await AsyncStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function toggleFavoritePlace(place: SearchPlace): Promise<SearchPlace[]> {
  try {
    const current = await loadFavoritePlaces();
    const exists = current.some(
      (p) => p.name === place.name && Math.abs(p.lat - place.lat) < 0.001
    );
    const next = exists
      ? current.filter((p) => !(p.name === place.name && Math.abs(p.lat - place.lat) < 0.001))
      : [place, ...current].slice(0, 12);
    await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
    return next;
  } catch {
    return [];
  }
}

export async function loadCommuteAnchors(): Promise<CommuteAnchors> {
  try {
    const raw = await AsyncStorage.getItem(COMMUTE_ANCHORS_KEY);
    if (!raw) return { home: null, work: null };
    const parsed = JSON.parse(raw);
    return {
      home: parsed?.home || null,
      work: parsed?.work || null,
    };
  } catch {
    return { home: null, work: null };
  }
}

export async function saveCommuteAnchor(
  slot: 'home' | 'work',
  place: SearchPlace | null
): Promise<CommuteAnchors> {
  try {
    const current = await loadCommuteAnchors();
    const next: CommuteAnchors = {
      ...current,
      [slot]: place,
    };
    await AsyncStorage.setItem(COMMUTE_ANCHORS_KEY, JSON.stringify(next));
    return next;
  } catch {
    return { home: null, work: null };
  }
}
