/**
 * GOBA Maps 圖磚樣式設定
 *
 * 預設使用 OpenFreeMap（基於 OpenStreetMap 向量圖磚，支援正式商用、無須 API Key、全球 CDN）。
 * 未來可透過環境變數 EXPO_PUBLIC_MAP_STYLE_URL 無縫切換為 MapTiler / Protomaps / 自架 Martin 圖磚伺服器。
 */
export interface MapStyleOption {
  id: 'liberty' | 'bright';
  label: string;
  url: string;
}

const CUSTOM_STYLE_URL = process.env.EXPO_PUBLIC_MAP_STYLE_URL?.trim();

export const MAP_STYLE_OPTIONS: MapStyleOption[] = [
  {
    id: 'liberty',
    label: '標準街道',
    url: CUSTOM_STYLE_URL || 'https://tiles.openfreemap.org/styles/liberty',
  },
  {
    id: 'bright',
    label: '明亮導航',
    url: CUSTOM_STYLE_URL || 'https://tiles.openfreemap.org/styles/bright',
  },
];

export const DEFAULT_MAP_STYLE_URL = MAP_STYLE_OPTIONS[0].url;
