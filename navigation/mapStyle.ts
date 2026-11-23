import { API_BASE } from '../services/api';

/**
 * GOBA Maps 台灣繁體中文客製化 MapLibre 圖磚樣式
 *
 * - 優先顯示台灣繁體中文地名（name:zh-Hant / name:zh-TW / name:nonlatin / name），消除不必要羅馬拼音
 * - 道路維持高辨識度中性色，突出粉色導航路線與下一路口
 * - 支援日間（day）、夜間（night）與導航專用（navigation-day / navigation-night）四種樣式
 */
export type MapBaseTheme = 'day' | 'night' | 'pink';
export type MapThemePreference = 'auto' | MapBaseTheme;

export interface MapStyleOption {
  id: MapBaseTheme;
  label: string;
  url: string;
  navUrl: string;
  isNight: boolean;
}

export const MAP_STYLE_OPTIONS: MapStyleOption[] = [
  {
    id: 'day',
    label: '日間標準',
    url: `${API_BASE}/api/maps/style/day.json`,
    navUrl: `${API_BASE}/api/maps/style/navigation-day.json`,
    isNight: false,
  },
  {
    id: 'night',
    label: '夜間深色',
    url: `${API_BASE}/api/maps/style/night.json`,
    navUrl: `${API_BASE}/api/maps/style/navigation-night.json`,
    isNight: true,
  },
  {
    id: 'pink',
    label: 'GOBA 粉',
    url: `${API_BASE}/api/maps/style/pink.json`,
    navUrl: `${API_BASE}/api/maps/style/navigation-pink.json`,
    isNight: false,
  },
];

export const FALLBACK_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * 依經緯度與當地時間估算太陽仰角，判斷目前是否為日落後／日出前（供導航中自動夜間切換）
 */
export function computeSunriseSunsetIsNight(lat: number, lon: number, now: Date = new Date()): boolean {
  const startOfYear = new Date(now.getFullYear(), 0, 0);
  const diffMs = now.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diffMs / 86400000);
  const rad = Math.PI / 180;
  const decl = -23.44 * rad * Math.cos(((360 / 365) * (dayOfYear + 10)) * rad);
  const latRad = Math.max(-65, Math.min(65, lat)) * rad;
  const cosH =
    (Math.sin(-0.833 * rad) - Math.sin(latRad) * Math.sin(decl)) /
    (Math.cos(latRad) * Math.cos(decl));
  if (cosH >= 1) return true;
  if (cosH <= -1) return false;
  const halfDayHours = (Math.acos(cosH) / rad) / 15;
  const solarNoonUtcHours = 12 - lon / 15;
  const utcHours =
    now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  const deltaFromNoon = Math.abs(((utcHours - solarNoonUtcHours + 36) % 24) - 12);
  return deltaFromNoon > halfDayHours;
}

export function resolveAutoMapTheme(options: {
  preference: MapThemePreference;
  isNavigating: boolean;
  systemColorScheme?: 'light' | 'dark' | null;
  lat?: number;
  lon?: number;
}): MapBaseTheme {
  if (options.preference !== 'auto') {
    return options.preference;
  }
  if (options.isNavigating) {
    const lat = typeof options.lat === 'number' ? options.lat : 25.033;
    const lon = typeof options.lon === 'number' ? options.lon : 121.5654;
    return computeSunriseSunsetIsNight(lat, lon) ? 'night' : 'day';
  }
  return options.systemColorScheme === 'dark' ? 'night' : 'day';
}

export function getEffectiveMapStyleUrl(
  themeOrIdx: number | MapBaseTheme,
  isNavigating: boolean,
  useFallback: boolean = false
): string {
  if (useFallback) return FALLBACK_MAP_STYLE_URL;
  const opt =
    typeof themeOrIdx === 'number'
      ? (MAP_STYLE_OPTIONS[themeOrIdx] || MAP_STYLE_OPTIONS[0])
      : (MAP_STYLE_OPTIONS.find((item) => item.id === themeOrIdx) || MAP_STYLE_OPTIONS[0]);
  return isNavigating ? opt.navUrl : opt.url;
}
