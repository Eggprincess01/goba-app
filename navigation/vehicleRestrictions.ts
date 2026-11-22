import { VehicleClassId } from './types';

/**
 * 台灣六大交通運具與道路權限資料模型
 * 1. 汽車 (car)
 * 2. 重機 (heavy_moto，目前不分黃紅牌)
 * 3. 摩托車 (scooter，白牌普通重機/輕型機車)
 * 4. 腳踏車 (bicycle)
 * 5. 步行 (pedestrian)
 * 6. 大眾交通 (transit)
 */
export interface VehicleRestrictionProfile {
  id: VehicleClassId;
  label: string;
  shortLabel: string;
  iconName: string;
  routeColor: string;
  routeCasingColor: string;
  /** 是否已完成台灣路網完整驗證（重機／摩托車會顯示測試中提醒） */
  isProductionVerified: boolean;
  /** 對應 Valhalla 引擎 costing 名稱 */
  valhallaCosting: 'auto' | 'motorcycle' | 'motor_scooter' | 'bicycle' | 'pedestrian';
  allowFreeway: boolean;
  allowExpressway: boolean;
  restrictedFromInnerFastLane: boolean;
  requireTwoStageLeftTurn: boolean;
  /** 模擬導航預設時速（m/s） */
  simSpeedMps: number;
  verificationNote: string;
}

export const TAIWAN_VEHICLE_PROFILES: VehicleRestrictionProfile[] = [
  {
    id: 'car',
    label: '汽車',
    shortLabel: '汽車',
    iconName: 'car-sport',
    routeColor: '#EC4899',
    routeCasingColor: '#831843',
    isProductionVerified: true,
    valhallaCosting: 'auto',
    allowFreeway: true,
    allowExpressway: true,
    restrictedFromInnerFastLane: false,
    requireTwoStageLeftTurn: false,
    simSpeedMps: 13.5,
    verificationNote: '支援國道、快速道路與一般市區道路規劃。',
  },
  {
    id: 'heavy_moto',
    label: '重機',
    shortLabel: '重機',
    iconName: 'speedometer',
    routeColor: '#EF4444',
    routeCasingColor: '#7F1D1D',
    isProductionVerified: false,
    valhallaCosting: 'motorcycle',
    allowFreeway: false,
    allowExpressway: true,
    restrictedFromInnerFastLane: false,
    requireTwoStageLeftTurn: false,
    simSpeedMps: 12.5,
    verificationNote: '重機模式（測試中）：目前不分黃紅牌，已避開國道收費路段，行駛快速道路請依現場標誌為準。',
  },
  {
    id: 'scooter',
    label: '摩托車',
    shortLabel: '摩托車',
    iconName: 'flash',
    routeColor: '#F97316',
    routeCasingColor: '#7C2D12',
    isProductionVerified: false,
    valhallaCosting: 'motor_scooter',
    allowFreeway: false,
    allowExpressway: false,
    restrictedFromInnerFastLane: true,
    requireTwoStageLeftTurn: true,
    simSpeedMps: 10.0,
    verificationNote: '摩托車模式（測試中）：已避開國道與主要快速道路，高架橋禁行機車與待轉請依現場標誌為準。',
  },
  {
    id: 'bicycle',
    label: '腳踏車',
    shortLabel: '腳踏車',
    iconName: 'bicycle',
    routeColor: '#10B981',
    routeCasingColor: '#065F46',
    isProductionVerified: true,
    valhallaCosting: 'bicycle',
    allowFreeway: false,
    allowExpressway: false,
    restrictedFromInnerFastLane: true,
    requireTwoStageLeftTurn: true,
    simSpeedMps: 4.8,
    verificationNote: '優先規劃自行車道與低速平面道路。',
  },
  {
    id: 'pedestrian',
    label: '步行',
    shortLabel: '步行',
    iconName: 'walk',
    routeColor: '#3B82F6',
    routeCasingColor: '#1E3A8A',
    isProductionVerified: true,
    valhallaCosting: 'pedestrian',
    allowFreeway: false,
    allowExpressway: false,
    restrictedFromInnerFastLane: false,
    requireTwoStageLeftTurn: false,
    simSpeedMps: 1.5,
    verificationNote: '優先規劃人行道、斑馬線與徒步區。',
  },
  {
    id: 'transit',
    label: '大眾交通',
    shortLabel: '大眾交通',
    iconName: 'train',
    routeColor: '#8B5CF6',
    routeCasingColor: '#4C1D95',
    isProductionVerified: false,
    valhallaCosting: 'pedestrian',
    allowFreeway: false,
    allowExpressway: false,
    restrictedFromInnerFastLane: false,
    requireTwoStageLeftTurn: false,
    simSpeedMps: 1.5,
    verificationNote: '大眾交通時刻表（TDX 捷運／公車／台鐵 GTFS）建置中，目前提供步行距離參考與一鍵查詢即時班次。',
  },
];

export function getVehicleProfile(id: VehicleClassId): VehicleRestrictionProfile {
  return TAIWAN_VEHICLE_PROFILES.find((v) => v.id === id) || TAIWAN_VEHICLE_PROFILES[0];
}
