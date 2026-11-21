export type TabType = 'home' | 'garage' | 'map' | 'services' | 'profile';
export type VehicleFilter = 'all' | 'scooter' | 'car';
export type MapCategory = 'gas' | 'parking' | 'traffic' | 'dmv';
export type FuelPref = '92' | '95' | '98' | 'diesel';

export interface VehicleItem {
  id: string;
  nickname: string;
  plate: string;
  category: 'scooter' | 'car';
  typeLabel: string;
  mileage: number;
  nextMaintKm: number;
  avgFuel: number;
  manufactureYM?: string;
  lastInspectionDate?: string;
  insuranceExpiry?: string;
  accentColor: string;
}

export interface RefuelLog {
  id: string;
  vehicleId: string;
  vehicleName: string;
  date: string;
  fuelType: FuelPref;
  fuelLabel: string;
  unitPrice: number;
  liters: number;
  originalAmount: number;
  paidAmount: number;
  odometer: number;
  kmPerLiter?: number;
}

export interface MaintSubItem {
  id: string;
  name: string;
  cost: number;
}

export interface MaintLog {
  id: string;
  vehicleId: string;
  vehicleName: string;
  date: string;
  items: MaintSubItem[];
  totalCost: number;
  odometer: number;
}

export interface AccountPrefs {
  customNickname: string;
  preferredFuel: FuelPref;
  notifyOil: boolean;
  notifyInsurance: boolean;
  notifyMaint: boolean;
}

export interface GarageCloudBundle {
  vehicles: VehicleItem[];
  refuelLogs: RefuelLog[];
  maintLogs: MaintLog[];
  prefs?: AccountPrefs;
  region?: { name: string; lat: number; lon: number; isGps?: boolean };
}

export const DEFAULT_PREFS: AccountPrefs = {
  customNickname: '',
  preferredFuel: '95',
  notifyOil: true,
  notifyInsurance: true,
  notifyMaint: true,
};

export const FUEL_OPTIONS: { key: FuelPref; label: string }[] = [
  { key: '92', label: '92 無鉛汽油' },
  { key: '95', label: '95 無鉛汽油' },
  { key: '98', label: '98 無鉛汽油' },
  { key: 'diesel', label: '超級柴油' },
];

export const GAS_BRAND_FILTERS = [
  '全部',
  '台灣中油',
  '台塑石油',
  '統一速邁樂',
  '全國加油站',
  '台亞石油',
  '山隆加油站',
];

export const COMMON_MAINT_ITEMS = [
  '更換機油',
  '更換齒輪油',
  '更換空氣濾網',
  '更換前輪胎',
  '更換後輪胎',
  '更換煞車皮',
  '更換電瓶',
  '傳動清潔',
  '火星塞',
];
