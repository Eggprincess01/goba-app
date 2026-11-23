import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import {
  AccountPrefs,
  DEFAULT_PREFS,
  MaintLog,
  RefuelLog,
  VehicleItem,
} from '../types';
import { RegionInfo, TAIWAN_REGIONS, UserProfile } from './api';

const SECURE_TOKEN_KEY = 'goba_session_token_secure';

export const STORAGE_KEYS = {
  LEGACY_TOKEN: 'goba_session_token',
  USER: 'goba_user_profile',
  REGION: 'goba_selected_region_v1',
  PREFS: 'goba_account_prefs_v1',
  VEHICLES: 'goba_vehicles_v1',
  VEHICLES_LEGACY_V2: 'goba_vehicles_v2',
  REFUELS: 'goba_refuels_v1',
  MAINTS: 'goba_maints_v1',
  UPDATED_AT: 'goba_local_updated_at_v1',
};

// -------------------- P0 #1: iOS Keychain 加密儲存 Session Token --------------------
export async function getSecureToken(): Promise<string | null> {
  try {
    const secureVal = await SecureStore.getItemAsync(SECURE_TOKEN_KEY);
    if (secureVal) return secureVal;

    // 一次性自動遷移舊版 AsyncStorage 明文 Token 至 Keychain，並立即刪除明文
    const legacy = await AsyncStorage.getItem(STORAGE_KEYS.LEGACY_TOKEN);
    if (legacy) {
      await SecureStore.setItemAsync(SECURE_TOKEN_KEY, legacy, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
      });
      await AsyncStorage.removeItem(STORAGE_KEYS.LEGACY_TOKEN);
      return legacy;
    }
  } catch {
    // fallback if SecureStore unavailable on simulator/web
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.LEGACY_TOKEN);
    } catch {
      return null;
    }
  }
  return null;
}

export async function setSecureToken(token: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(SECURE_TOKEN_KEY, token, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
    // 確保不留任何明文複本
    await AsyncStorage.removeItem(STORAGE_KEYS.LEGACY_TOKEN);
  } catch {
    await AsyncStorage.setItem(STORAGE_KEYS.LEGACY_TOKEN, token);
  }
}

export async function deleteSecureToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SECURE_TOKEN_KEY);
  } catch {
    // ignore
  }
  try {
    await AsyncStorage.removeItem(STORAGE_KEYS.LEGACY_TOKEN);
    await AsyncStorage.removeItem(STORAGE_KEYS.USER);
  } catch {
    // ignore
  }
}

// -------------------- 本機資料載入（P0 #2：正式版無預設示範假車） --------------------
export interface LocalBootstrapState {
  token: string | null;
  user: UserProfile | null;
  region: RegionInfo;
  prefs: AccountPrefs;
  vehicles: VehicleItem[];
  refuelLogs: RefuelLog[];
  maintLogs: MaintLog[];
  localUpdatedAt: number;
}

export async function loadLocalState(): Promise<LocalBootstrapState> {
  const [token, savedUser, savedRegion, savedPrefs, savedV1, savedV2, savedRefuels, savedMaints, savedTs] =
    await Promise.all([
      getSecureToken(),
      AsyncStorage.getItem(STORAGE_KEYS.USER),
      AsyncStorage.getItem(STORAGE_KEYS.REGION),
      AsyncStorage.getItem(STORAGE_KEYS.PREFS),
      AsyncStorage.getItem(STORAGE_KEYS.VEHICLES),
      AsyncStorage.getItem(STORAGE_KEYS.VEHICLES_LEGACY_V2),
      AsyncStorage.getItem(STORAGE_KEYS.REFUELS),
      AsyncStorage.getItem(STORAGE_KEYS.MAINTS),
      AsyncStorage.getItem(STORAGE_KEYS.UPDATED_AT),
    ]);

  let region: RegionInfo = TAIWAN_REGIONS[3];
  if (savedRegion) {
    try {
      const parsed = JSON.parse(savedRegion);
      if (parsed && typeof parsed.lat === 'number') region = parsed;
    } catch {
      region = TAIWAN_REGIONS[3];
    }
  }

  let prefs: AccountPrefs = DEFAULT_PREFS;
  if (savedPrefs) {
    try {
      prefs = { ...DEFAULT_PREFS, ...JSON.parse(savedPrefs) };
    } catch {
      prefs = DEFAULT_PREFS;
    }
  }

  let user: UserProfile | null = null;
  if (savedUser) {
    try {
      user = JSON.parse(savedUser);
    } catch {
      user = null;
    }
  }

  let vehicles: VehicleItem[] = [];
  const rawV = savedV1 || savedV2;
  if (rawV) {
    try {
      vehicles = JSON.parse(rawV).map((v: any) => ({
        ...v,
        manufactureYM: v.manufactureYM || '',
        lastInspectionDate: v.lastInspectionDate || '',
        insuranceExpiry: v.insuranceExpiry || '',
      }));
    } catch {
      vehicles = [];
    }
  }

  let refuelLogs: RefuelLog[] = [];
  if (savedRefuels) {
    try {
      refuelLogs = JSON.parse(savedRefuels);
    } catch {
      refuelLogs = [];
    }
  }

  let maintLogs: MaintLog[] = [];
  if (savedMaints) {
    try {
      maintLogs = JSON.parse(savedMaints);
    } catch {
      maintLogs = [];
    }
  }

  return {
    token,
    user,
    region,
    prefs,
    vehicles,
    refuelLogs,
    maintLogs,
    localUpdatedAt: savedTs ? parseInt(savedTs, 10) || 0 : 0,
  };
}

export async function touchLocalUpdatedAt(ts?: number): Promise<number> {
  const val = ts ?? Date.now();
  await AsyncStorage.setItem(STORAGE_KEYS.UPDATED_AT, String(val));
  return val;
}

export async function saveLocalUser(user: UserProfile): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
}

export async function saveLocalVehicles(vehicles: VehicleItem[]): Promise<number> {
  await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(vehicles));
  return touchLocalUpdatedAt();
}

export async function saveLocalRefuels(logs: RefuelLog[]): Promise<number> {
  await AsyncStorage.setItem(STORAGE_KEYS.REFUELS, JSON.stringify(logs));
  return touchLocalUpdatedAt();
}

export async function saveLocalMaints(logs: MaintLog[]): Promise<number> {
  await AsyncStorage.setItem(STORAGE_KEYS.MAINTS, JSON.stringify(logs));
  return touchLocalUpdatedAt();
}

export async function saveLocalPrefs(prefs: AccountPrefs): Promise<number> {
  await AsyncStorage.setItem(STORAGE_KEYS.PREFS, JSON.stringify(prefs));
  return touchLocalUpdatedAt();
}

export async function saveLocalRegion(region: RegionInfo): Promise<number> {
  await AsyncStorage.setItem(STORAGE_KEYS.REGION, JSON.stringify(region));
  return touchLocalUpdatedAt();
}
