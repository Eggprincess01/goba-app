/**
 * GOBA Maps 圖磚樣式設定（支援日間／明亮／夜間護眼模式 + 載入失敗自動備援）
 *
 * 預設使用 OpenFreeMap（基於 OpenStreetMap 向量圖磚，支援正式商用、無須 API Key、全球 CDN）。
 */
export interface MapStyleOption {
  id: 'liberty' | 'bright' | 'night';
  label: string;
  url: string;
  isNight?: boolean;
}

const CUSTOM_STYLE_URL = process.env.EXPO_PUBLIC_MAP_STYLE_URL?.trim();

export const MAP_STYLE_OPTIONS: MapStyleOption[] = [
  {
    id: 'liberty',
    label: '日間標準',
    url: CUSTOM_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty',
    isNight: false,
  },
  {
    id: 'bright',
    label: '高對比導航',
    url: CUSTOM_STYLE_URL || 'https://tiles.openfreemap.org/styles/bright',
    isNight: false,
  },
  {
    id: 'night',
    label: '夜間護眼',
    url: CUSTOM_STYLE_URL || 'https://tiles.openfreemap.org/styles/positron',
    isNight: true,
  },
];

export const DEFAULT_MAP_STYLE_URL = MAP_STYLE_OPTIONS[0].url;
