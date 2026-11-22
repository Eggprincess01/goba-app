import { API_BASE } from '../services/api';

/**
 * GOBA Maps 台灣繁體中文客製化 MapLibre 圖磚樣式
 *
 * - 優先顯示台灣繁體中文地名（name:zh-Hant / name:zh-TW / name:nonlatin / name），消除不必要羅馬拼音
 * - 道路維持高辨識度中性色，突出粉色導航路線與下一路口
 * - 支援日間（day）、夜間（night）與導航專用（navigation-day / navigation-night）四種樣式
 */
export type MapBaseTheme = 'day' | 'night';

export interface MapStyleOption {
  id: 'day' | 'night';
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
];

export const FALLBACK_MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

export function getEffectiveMapStyleUrl(
  themeIdx: number,
  isNavigating: boolean,
  useFallback: boolean = false
): string {
  if (useFallback) return FALLBACK_MAP_STYLE_URL;
  const opt = MAP_STYLE_OPTIONS[themeIdx] || MAP_STYLE_OPTIONS[0];
  return isNavigating ? opt.navUrl : opt.url;
}
