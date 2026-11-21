import { VehicleClassId } from './types';

/**
 * 台灣車種道路權限與限制資料模型
 * 第一階段僅開放「汽車」作為正式可規劃車種；
 * 機車與重機因涉及台灣國道、快速道路（台61/64/65/74 等）、禁行機車內側車道與待轉規則，
 * 必須在第二階段完成 OSM tag 驗證與自訂 Valhalla costing 後才開放。
 */
export interface VehicleRestrictionProfile {
  id: VehicleClassId;
  label: string;
  shortLabel: string;
  plateColor: string;
  plateTextColor: string;
  /** 是否已完成台灣路網驗證並開放於正式導航 */
  isProductionVerified: boolean;
  /** 對應 Valhalla 引擎 costing 名稱 */
  valhallaCosting: 'auto' | 'motorcycle' | 'motor_scooter';
  /** 是否允許行駛國道（高速公路） */
  allowFreeway: boolean;
  /** 是否允許行駛省道快速公路（紅盾牌） */
  allowExpressway: boolean;
  /** 是否受禁行機車內側車道限制 */
  restrictedFromInnerFastLane: boolean;
  /** 是否需依標誌執行兩段式左轉 */
  requireTwoStageLeftTurn: boolean;
  /** 未開放原因說明（UI 顯示用） */
  verificationNote: string;
}

export const TAIWAN_VEHICLE_PROFILES: VehicleRestrictionProfile[] = [
  {
    id: 'car',
    label: '汽車（小客車）',
    shortLabel: '汽車',
    plateColor: '#FFFFFF',
    plateTextColor: '#111827',
    isProductionVerified: true,
    valhallaCosting: 'auto',
    allowFreeway: true,
    allowExpressway: true,
    restrictedFromInnerFastLane: false,
    requireTwoStageLeftTurn: false,
    verificationNote: '第一階段已開放：支援國道、快速道路與市區道路規劃。',
  },
  {
    id: 'heavy_moto_red',
    label: '大型重機（紅牌 550cc+）',
    shortLabel: '紅牌重機',
    plateColor: '#DC2626',
    plateTextColor: '#FFFFFF',
    isProductionVerified: false,
    valhallaCosting: 'motorcycle',
    allowFreeway: false, // 除國3甲外台灣法規尚未全面開放國道
    allowExpressway: true,
    restrictedFromInnerFastLane: false,
    requireTwoStageLeftTurn: false,
    verificationNote: '測試驗證中（Phase 2 開放）：需排除國道（國3甲除外）並驗證快速道路匝道權限。',
  },
  {
    id: 'heavy_moto_yellow',
    label: '大型重機（黃牌 250~550cc）',
    shortLabel: '黃牌重機',
    plateColor: '#FACC15',
    plateTextColor: '#111827',
    isProductionVerified: false,
    valhallaCosting: 'motorcycle',
    allowFreeway: false,
    allowExpressway: true,
    restrictedFromInnerFastLane: false,
    requireTwoStageLeftTurn: false,
    verificationNote: '測試驗證中（Phase 2 開放）：需驗證省道快速公路與高架橋路權。',
  },
  {
    id: 'white_plate_moto',
    label: '普通重型機車（白牌）',
    shortLabel: '白牌機車',
    plateColor: '#F3F4F6',
    plateTextColor: '#1F2937',
    isProductionVerified: false,
    valhallaCosting: 'motor_scooter',
    allowFreeway: false,
    allowExpressway: false,
    restrictedFromInnerFastLane: true,
    requireTwoStageLeftTurn: true,
    verificationNote: '測試驗證中（Phase 2 開放）：需嚴格排除國道、快速道路與禁行機車高架橋，避免誤導上橋。',
  },
  {
    id: 'scooter_green',
    label: '輕型機車（綠牌）',
    shortLabel: '綠牌機車',
    plateColor: '#16A34A',
    plateTextColor: '#FFFFFF',
    isProductionVerified: false,
    valhallaCosting: 'motor_scooter',
    allowFreeway: false,
    allowExpressway: false,
    restrictedFromInnerFastLane: true,
    requireTwoStageLeftTurn: true,
    verificationNote: '測試驗證中（Phase 2 開放）：僅限一般平面慢車道與機慢車優先道。',
  },
];

export function getVehicleProfile(id: VehicleClassId): VehicleRestrictionProfile {
  return TAIWAN_VEHICLE_PROFILES.find((v) => v.id === id) || TAIWAN_VEHICLE_PROFILES[0];
}

export function isVehicleProductionReady(id: VehicleClassId): boolean {
  return getVehicleProfile(id).isProductionVerified;
}
