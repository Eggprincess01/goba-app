import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Modal,
  TextInput,
  Alert,
  Platform,
  Linking,
  ActivityIndicator,
  RefreshControl,
  KeyboardAvoidingView,
  Keyboard,
  Switch,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import { LiquidGlassSurface } from './components/LiquidGlassSurface';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import * as Location from 'expo-location';

import { styles } from './styles/theme';
import {
  AccountPrefs,
  DEFAULT_PREFS,
  FUEL_OPTIONS,
  FuelPref,
  MaintLog,
  MaintSubItem,
  RefuelLog,
  TabType,
  VehicleFilter,
  VehicleItem,
} from './types';
import {
  API_BASE,
  TAIWAN_REGIONS,
  PLATE_CAR_TYPES,
  RegionInfo,
  CarTypeOption,
  LiveWeather,
  LiveAqi,
  LiveOilPrices,
  UserProfile,
  PlateResult,
  ExamSlot,
  fetchLiveWeather,
  fetchLiveAqi,
  fetchLiveOilPrices,
  fetchAuthMe,
  logoutAuth,
  deleteAccount,
  searchLivePlates,
  fetchExamSlots,
  fetchUserTasks,
  fetchUserFavorites,
  addUserFavorite,
  fetchCloudGarage,
  pushCloudGarage,
  getReadableError,
} from './services/api';
import {
  deleteSecureToken,
  loadLocalState,
  saveLocalMaints,
  saveLocalPrefs,
  saveLocalRefuels,
  saveLocalRegion,
  saveLocalUser,
  saveLocalVehicles,
  setSecureToken,
  touchLocalUpdatedAt,
} from './services/storage';

import { HomeTab } from './components/HomeTab';
import { GarageTab } from './components/GarageTab';
import { ServicesTab } from './components/ServicesTab';
import { ProfileTab } from './components/ProfileTab';
import { NavigationScreen } from './screens/NavigationScreen';
import { PlateAndExamModals } from './components/modals/PlateAndExamModals';
import { GarageModals } from './components/modals/GarageModals';

WebBrowser.maybeCompleteAuthSession();

// P0 #3: 統一由 app.json 單一來源讀取版本號
const APP_VERSION = Constants.expoConfig?.version || '1.1.0';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [region, setRegion] = useState<RegionInfo>(TAIWAN_REGIONS[3]);
  const [refreshing, setRefreshing] = useState(false);
  const [openFleetTrigger, setOpenFleetTrigger] = useState(0);

  // 即時真實資料 + 錯誤狀態 (P1 #4)
  const [weather, setWeather] = useState<LiveWeather | null>(null);
  const [aqi, setAqi] = useState<LiveAqi | null>(null);
  const [oilPrices, setOilPrices] = useState<LiveOilPrices | null>(null);
  const [loadingLive, setLoadingLive] = useState(true);
  const [liveError, setLiveError] = useState<string | null>(null);

  // 地區設定 Modal + GPS
  const [regionModalVisible, setRegionModalVisible] = useState(false);
  const [regionSearch, setRegionSearch] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);

  // 登入與帳戶偏好 (P0 #1 Keychain Token)
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userTasks, setUserTasks] = useState<any[]>([]);
  const [userFavorites, setUserFavorites] = useState<any[]>([]);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);

  const [prefs, setPrefs] = useState<AccountPrefs>(DEFAULT_PREFS);
  const [accountSettingsVisible, setAccountSettingsVisible] = useState(false);
  const [draftNickname, setDraftNickname] = useState('');

  // 車庫持久化資料 (P0 #2: 預設空陣列，無示範假車) + P1 #6 雲端同步
  const [vehicleFilter, setVehicleFilter] = useState<VehicleFilter>('all');
  const [vehicles, setVehicles] = useState<VehicleItem[]>([]);
  const [refuelLogs, setRefuelLogs] = useState<RefuelLog[]>([]);
  const [maintLogs, setMaintLogs] = useState<MaintLog[]>([]);
  const [cloudSyncStatus, setCloudSyncStatus] = useState('');
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const localUpdatedAtRef = useRef<number>(0);

  // 內建 GOBA Maps (MapLibre) 首次開啟後常駐保留（切分頁只隱藏不重新載入）
  const [hasOpenedMapTab, setHasOpenedMapTab] = useState(false);
  const [mapTabBarVisible, setMapTabBarVisible] = useState(true);
  useEffect(() => {
    if (activeTab === 'map' && !hasOpenedMapTab) {
      setHasOpenedMapTab(true);
    }
  }, [activeTab, hasOpenedMapTab]);

  // 加油紀錄 Modal
  const [refuelModalVisible, setRefuelModalVisible] = useState(false);
  const [refuelVehicleId, setRefuelVehicleId] = useState<string>('');
  const [refuelVehicleDropdownOpen, setRefuelVehicleDropdownOpen] = useState(false);
  const [refuelFuelType, setRefuelFuelType] = useState<FuelPref>('95');
  const [refuelFuelDropdownOpen, setRefuelFuelDropdownOpen] = useState(false);
  const [refuelLiters, setRefuelLiters] = useState('');
  const [refuelOriginalAmount, setRefuelOriginalAmount] = useState('');
  const [refuelDiscountedAmount, setRefuelDiscountedAmount] = useState('');
  const [refuelKm, setRefuelKm] = useState('');

  // 保養紀錄 Modal
  const [maintModalVisible, setMaintModalVisible] = useState(false);
  const [maintVehicleId, setMaintVehicleId] = useState<string>('');
  const [maintVehicleDropdownOpen, setMaintVehicleDropdownOpen] = useState(false);
  const [maintDraftItems, setMaintDraftItems] = useState<MaintSubItem[]>([]);
  const [maintCustomName, setMaintCustomName] = useState('');
  const [maintCustomCost, setMaintCustomCost] = useState('');
  const [maintKm, setMaintKm] = useState('');

  // 保險 / 驗車 / 統計 / 新增車輛 Modals
  const [insuranceModalVisible, setInsuranceModalVisible] = useState(false);
  const [insVehicleId, setInsVehicleId] = useState<string>('');
  const [insVehicleDropdownOpen, setInsVehicleDropdownOpen] = useState(false);
  const [insExpiryInput, setInsExpiryInput] = useState('');

  const [inspectionModalVisible, setInspectionModalVisible] = useState(false);
  const [inspVehicleId, setInspVehicleId] = useState<string>('');
  const [inspVehicleDropdownOpen, setInspVehicleDropdownOpen] = useState(false);
  const [inspMfgInput, setInspMfgInput] = useState('');
  const [inspLastDateInput, setInspLastDateInput] = useState('');

  const [statsModalVisible, setStatsModalVisible] = useState(false);

  const [addVehicleModalVisible, setAddVehicleModalVisible] = useState(false);
  const [newVehicleName, setNewVehicleName] = useState('');
  const [newVehiclePlate, setNewVehiclePlate] = useState('');
  const [newVehicleKm, setNewVehicleKm] = useState('');
  const [newVehicleMfgYM, setNewVehicleMfgYM] = useState('');
  const [newVehicleLastInsp, setNewVehicleLastInsp] = useState('');
  const [newVehicleInsExpiry, setNewVehicleInsExpiry] = useState('');
  const [newVehicleCategory, setNewVehicleCategory] = useState<'scooter' | 'car'>('scooter');

  // 車牌查詢 & 考照雷達 Modals
  const [plateModalVisible, setPlateModalVisible] = useState(false);
  const [plateQuery, setPlateQuery] = useState('9969');
  const [selectedCarType, setSelectedCarType] = useState<CarTypeOption>(PLATE_CAR_TYPES[0]);
  const [plateResults, setPlateResults] = useState<PlateResult[]>([]);
  const [plateTotal, setPlateTotal] = useState(0);
  const [plateUpdatedTime, setPlateUpdatedTime] = useState('');
  const [plateLoading, setPlateLoading] = useState(false);

  const [examModalVisible, setExamModalVisible] = useState(false);
  const [examLicenseType, setExamLicenseType] = useState('3');
  const [examFilterText, setExamFilterText] = useState('');
  const [examSlots, setExamSlots] = useState<ExamSlot[]>([]);
  const [examAvailCount, setExamAvailCount] = useState(0);
  const [examLoading, setExamLoading] = useState(false);

  const getFuelUnitPrice = useCallback(
    (fuel: FuelPref): number => {
      if (!oilPrices) return 0;
      const raw =
        fuel === '92'
          ? oilPrices.price92
          : fuel === '95'
          ? oilPrices.price95
          : fuel === '98'
          ? oilPrices.price98
          : oilPrices.priceDiesel;
      const num = parseFloat(raw);
      return isNaN(num) ? 0 : num;
    },
    [oilPrices]
  );

  // -------------------- P1 #4: 即時天氣、AQI、油價（含離線/錯誤提示） --------------------
  const loadLiveData = useCallback(async (targetRegion: RegionInfo) => {
    setLoadingLive(true);
    setLiveError(null);
    try {
      const [wRes, aRes, oRes] = await Promise.allSettled([
        fetchLiveWeather(targetRegion.lat, targetRegion.lon),
        fetchLiveAqi(targetRegion.lat, targetRegion.lon),
        fetchLiveOilPrices(),
      ]);
      let failCount = 0;
      if (wRes.status === 'fulfilled') setWeather(wRes.value);
      else failCount++;
      if (aRes.status === 'fulfilled') setAqi(aRes.value);
      if (oRes.status === 'fulfilled') setOilPrices(oRes.value);
      else failCount++;

      if (failCount === 2) {
        setLiveError('目前無法更新即時氣象與油價，請檢查網路連線');
      } else if (failCount === 1) {
        setLiveError('部分即時資料暫時無法取得，顯示快取內容');
      }
    } catch (err) {
      setLiveError(getReadableError(err));
    } finally {
      setLoadingLive(false);
    }
  }, []);

  // -------------------- P1 #6: 車庫雲端雙向同步 --------------------
  const pushGarageToCloud = useCallback(
    async (
      token: string | null,
      nextVehicles: VehicleItem[],
      nextRefuels: RefuelLog[],
      nextMaints: MaintLog[],
      nextPrefs: AccountPrefs,
      nextRegion: RegionInfo,
      ts: number
    ) => {
      if (!token) return;
      setIsSyncingCloud(true);
      try {
        const res = await pushCloudGarage(
          token,
          {
            vehicles: nextVehicles,
            refuelLogs: nextRefuels,
            maintLogs: nextMaints,
            prefs: nextPrefs,
            region: nextRegion,
          },
          ts
        );
        localUpdatedAtRef.current = res.updated_at;
        await touchLocalUpdatedAt(res.updated_at);
        const now = new Date();
        setCloudSyncStatus(
          `雲端已同步 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
        );
      } catch {
        setCloudSyncStatus('本機已儲存（待連線同步）');
      } finally {
        setIsSyncingCloud(false);
      }
    },
    []
  );

  const syncCloudGarageOnLogin = useCallback(
    async (
      token: string,
      curVehicles: VehicleItem[],
      curRefuels: RefuelLog[],
      curMaints: MaintLog[],
      curPrefs: AccountPrefs,
      curRegion: RegionInfo,
      localTs: number
    ) => {
      setIsSyncingCloud(true);
      try {
        const cloud = await fetchCloudGarage(token);
        if (cloud.exists && cloud.data && cloud.updated_at > localTs) {
          const cv = Array.isArray(cloud.data.vehicles) ? cloud.data.vehicles : [];
          const cr = Array.isArray(cloud.data.refuelLogs) ? cloud.data.refuelLogs : [];
          const cm = Array.isArray(cloud.data.maintLogs) ? cloud.data.maintLogs : [];
          setVehicles(cv);
          setRefuelLogs(cr);
          setMaintLogs(cm);
          await Promise.all([
            saveLocalVehicles(cv),
            saveLocalRefuels(cr),
            saveLocalMaints(cm),
            touchLocalUpdatedAt(cloud.updated_at),
          ]);
          localUpdatedAtRef.current = cloud.updated_at;
          if (cv.length > 0) {
            setRefuelVehicleId(cv[0].id);
            setMaintVehicleId(cv[0].id);
            setInsVehicleId(cv[0].id);
            setInspVehicleId(cv[0].id);
          }
          setCloudSyncStatus('已從雲端還原車庫');
        } else if (curVehicles.length > 0 || curRefuels.length > 0 || curMaints.length > 0) {
          await pushGarageToCloud(token, curVehicles, curRefuels, curMaints, curPrefs, curRegion, localTs || Date.now());
        } else {
          setCloudSyncStatus('雲端同步已啟用');
        }
      } catch {
        setCloudSyncStatus('雲端連線異常（使用本機資料）');
      } finally {
        setIsSyncingCloud(false);
      }
    },
    [pushGarageToCloud]
  );

  const syncBackendAccount = useCallback(
    async (
      token: string,
      curVehicles: VehicleItem[],
      curRefuels: RefuelLog[],
      curMaints: MaintLog[],
      curPrefs: AccountPrefs,
      curRegion: RegionInfo,
      localTs: number
    ) => {
      try {
        const profile = await fetchAuthMe(token);
        if (profile) {
          setUser(profile);
          setSessionToken(token);
          await saveLocalUser(profile);
          const [tasks, favs] = await Promise.all([
            fetchUserTasks(token),
            fetchUserFavorites(token),
          ]);
          setUserTasks(tasks);
          setUserFavorites(favs);
          syncCloudGarageOnLogin(token, curVehicles, curRefuels, curMaints, curPrefs, curRegion, localTs);
          return profile;
        } else {
          await deleteSecureToken();
          setUser(null);
          setSessionToken(null);
        }
      } catch {
        // 離線時保留已快取之登入狀態
      }
      return null;
    },
    [syncCloudGarageOnLogin]
  );

  // -------------------- 啟動初始化 --------------------
  useEffect(() => {
    const bootstrap = async () => {
      const local = await loadLocalState();
      setRegion(local.region);
      setPrefs(local.prefs);
      setRefuelFuelType(local.prefs.preferredFuel);
      setVehicles(local.vehicles);
      setRefuelLogs(local.refuelLogs);
      setMaintLogs(local.maintLogs);
      localUpdatedAtRef.current = local.localUpdatedAt;

      if (local.vehicles.length > 0) {
        setRefuelVehicleId(local.vehicles[0].id);
        setMaintVehicleId(local.vehicles[0].id);
        setInsVehicleId(local.vehicles[0].id);
        setInspVehicleId(local.vehicles[0].id);
      }
      if (local.user) setUser(local.user);
      if (local.token) {
        setSessionToken(local.token);
        syncBackendAccount(
          local.token,
          local.vehicles,
          local.refuelLogs,
          local.maintLogs,
          local.prefs,
          local.region,
          local.localUpdatedAt
        );
      }
      loadLiveData(local.region);
    };
    bootstrap();
  }, [loadLiveData, syncBackendAccount]);

  // -------------------- Deep Link 登入回調（#1 先向後端驗證 token 再存儲，#2 去重防重複彈窗） --------------------
  const handledAuthUrlsRef = useRef<Set<string>>(new Set());
  const handleAuthCallbackUrl = useCallback(
    async (url: string) => {
      if (!url || !url.startsWith('goba://')) return;
      if (handledAuthUrlsRef.current.has(url)) return;
      handledAuthUrlsRef.current.add(url);

      const tokenMatch = url.match(/[?&]token=([^&]+)/);
      const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : '';
      if (!token) return;

      // 先向後端驗證 token 有效性，絕不直接寫入未驗證的外部 token
      const verifiedUser = await fetchAuthMe(token).catch(() => null);
      if (!verifiedUser) {
        Alert.alert('登入驗證失敗', '授權憑證無效或已過期，請重新登入。');
        return;
      }

      await setSecureToken(token);
      const profile = await syncBackendAccount(
        token,
        vehicles,
        refuelLogs,
        maintLogs,
        prefs,
        region,
        localUpdatedAtRef.current
      );
      if (profile) {
        Alert.alert('登入成功 🎉', `歡迎回來，${profile.name}！`);
      }
    },
    [syncBackendAccount, vehicles, refuelLogs, maintLogs, prefs, region]
  );

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => handleAuthCallbackUrl(url));
    Linking.getInitialURL().then((url) => {
      if (url) handleAuthCallbackUrl(url);
    });
    return () => sub.remove();
  }, [handleAuthCallbackUrl]);

  // -------------------- 地區與 GPS 定位 --------------------
  const selectRegion = async (nextRegion: RegionInfo) => {
    setRegion(nextRegion);
    const ts = await saveLocalRegion(nextRegion);
    localUpdatedAtRef.current = ts;
    setRegionModalVisible(false);
    setRegionSearch('');
    loadLiveData(nextRegion);
    pushGarageToCloud(sessionToken, vehicles, refuelLogs, maintLogs, prefs, nextRegion, ts);
  };

  const handleUseGpsLocation = async () => {
    setGpsLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('未開啟定位權限', '請到 iPhone「設定 ➔ 鍋巴 GOBA ➔ 位置」開啟定位權限，或從下方手動選擇地區。');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      let label = '目前位置';
      try {
        const geos = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geos && geos.length > 0) {
          const g = geos[0];
          const parts = [g.city || g.region, g.district || g.subregion].filter(Boolean);
          if (parts.length > 0) label = parts.join(' ');
        }
      } catch {
        // fallback
      }
      await selectRegion({ name: label, lat: latitude, lon: longitude, isGps: true });
    } catch {
      Alert.alert('定位失敗', '無法取得目前 GPS 位置，請確認手機已開啟定位服務或手動選擇地區。');
    } finally {
      setGpsLoading(false);
    }
  };

  // -------------------- Google 一鍵登入 / 登出 --------------------
  const handleGoogleLogin = async () => {
    setIsLoadingAuth(true);
    try {
      const authUrl = `${API_BASE}/api/auth/login-bridge?return_to=${encodeURIComponent('goba://auth')}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, 'goba://');
      if (result.type === 'success' && result.url) {
        await handleAuthCallbackUrl(result.url);
      }
    } catch {
      Alert.alert('連線異常', '無法開啟 Google 授權視窗，請檢查網路連線後重試。');
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const handleLogout = () => {
    Alert.alert('登出確認', '確定要登出當前帳號嗎？', [
      { text: '取消', style: 'cancel' },
      {
        text: '確定登出',
        style: 'destructive',
        onPress: async () => {
          if (sessionToken) await logoutAuth(sessionToken);
          await deleteSecureToken();
          setSessionToken(null);
          setUser(null);
          setUserTasks([]);
          setUserFavorites([]);
          setCloudSyncStatus('');
          Alert.alert('已登出', '您已安全登出鍋巴 GOBA。');
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    if (!sessionToken) return;
    Alert.alert(
      '刪除帳號確認',
      '此動作將永久刪除您的帳號、車庫雲端紀錄、車牌任務與收藏資料且無法復原，確定要刪除嗎？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '永久刪除',
          style: 'destructive',
          onPress: async () => {
            const ok = await deleteAccount(sessionToken).catch(() => false);
            if (!ok) {
              Alert.alert('刪除失敗', '請檢查網路連線後重試。');
              return;
            }
            await deleteSecureToken();
            setSessionToken(null);
            setUser(null);
            setUserTasks([]);
            setUserFavorites([]);
            setCloudSyncStatus('');
            Alert.alert('已刪除帳號', '您的帳號與雲端資料已永久移除。');
          },
        },
      ]
    );
  };

  const saveAccountPrefsAndSync = async (next: AccountPrefs) => {
    setPrefs(next);
    const ts = await saveLocalPrefs(next);
    localUpdatedAtRef.current = ts;
    pushGarageToCloud(sessionToken, vehicles, refuelLogs, maintLogs, next, region, ts);
  };

  const onPullRefresh = async () => {
    setRefreshing(true);
    await loadLiveData(region);
    if (sessionToken) {
      await syncBackendAccount(sessionToken, vehicles, refuelLogs, maintLogs, prefs, region, localUpdatedAtRef.current);
    }
    setRefreshing(false);
  };

  // -------------------- 車庫 CRUD（本機儲存 + 雲端自動同步） --------------------
  const persistVehiclesAndSync = async (nextVehicles: VehicleItem[]) => {
    setVehicles(nextVehicles);
    const ts = await saveLocalVehicles(nextVehicles);
    localUpdatedAtRef.current = ts;
    pushGarageToCloud(sessionToken, nextVehicles, refuelLogs, maintLogs, prefs, region, ts);
  };

  const handleAddVehicle = async () => {
    if (!newVehicleName.trim() || !newVehiclePlate.trim()) {
      Alert.alert('提醒', '請輸入車款名稱與車牌號碼！');
      return;
    }
    if (newVehicleMfgYM.trim() && !/^\d{4}-\d{2}$/.test(newVehicleMfgYM.trim())) {
      Alert.alert('格式錯誤', '出廠年月請依 YYYY-MM 格式填寫（例如：2021-06），或留空稍後設定。');
      return;
    }
    if (newVehicleInsExpiry.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(newVehicleInsExpiry.trim())) {
      Alert.alert('格式錯誤', '強制險到期日請依 YYYY-MM-DD 格式填寫（例如：2027-05-20），或留空稍後設定。');
      return;
    }
    if (newVehicleLastInsp.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(newVehicleLastInsp.trim())) {
      Alert.alert('格式錯誤', '上次定檢日期請依 YYYY-MM-DD 格式填寫，或留空稍後設定。');
      return;
    }
    Keyboard.dismiss();
    const kmNum = parseInt(newVehicleKm, 10) || 0;
    const item: VehicleItem = {
      id: String(Date.now()),
      nickname: newVehicleName.trim(),
      plate: newVehiclePlate.trim().toUpperCase(),
      category: newVehicleCategory,
      typeLabel: newVehicleCategory === 'scooter' ? '機車 / 重機' : '自用小客車',
      mileage: kmNum,
      nextMaintKm: kmNum + (newVehicleCategory === 'scooter' ? 2000 : 5000),
      avgFuel: newVehicleCategory === 'scooter' ? 36.0 : 14.5,
      manufactureYM: newVehicleMfgYM.trim(),
      lastInspectionDate: newVehicleLastInsp.trim(),
      insuranceExpiry: newVehicleInsExpiry.trim(),
      accentColor: newVehicleCategory === 'scooter' ? '#EC4899' : '#2563EB',
    };
    const nextList = [item, ...vehicles];
    await persistVehiclesAndSync(nextList);
    if (nextList.length === 1) {
      setRefuelVehicleId(item.id);
      setMaintVehicleId(item.id);
      setInsVehicleId(item.id);
      setInspVehicleId(item.id);
    }
    setAddVehicleModalVisible(false);
    setNewVehicleName('');
    setNewVehiclePlate('');
    setNewVehicleKm('');
    setNewVehicleMfgYM('');
    setNewVehicleLastInsp('');
    setNewVehicleInsExpiry('');
    Alert.alert('新增成功 🎉', `已將【${item.nickname}】儲存至您的車庫！`);
  };

  const handleDeleteVehicle = (v: VehicleItem) => {
    Alert.alert('刪除車輛', `確定要從車庫移除【${v.nickname}】嗎？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '移除',
        style: 'destructive',
        onPress: async () => {
          await persistVehiclesAndSync(vehicles.filter((item) => item.id !== v.id));
        },
      },
    ]);
  };

  // -------------------- 加油雙向換算與儲存 --------------------
  const onChangeRefuelLiters = (val: string) => {
    setRefuelLiters(val);
    const l = parseFloat(val);
    const unit = getFuelUnitPrice(refuelFuelType);
    if (!isNaN(l) && l > 0 && unit > 0) setRefuelOriginalAmount(String(Math.round(l * unit)));
    else if (!val.trim()) setRefuelOriginalAmount('');
  };

  const onChangeRefuelOriginalAmount = (val: string) => {
    setRefuelOriginalAmount(val);
    const amt = parseFloat(val);
    const unit = getFuelUnitPrice(refuelFuelType);
    if (!isNaN(amt) && amt > 0 && unit > 0) setRefuelLiters((amt / unit).toFixed(2));
    else if (!val.trim()) setRefuelLiters('');
  };

  const onSelectRefuelFuelType = (fuel: FuelPref) => {
    setRefuelFuelType(fuel);
    setRefuelFuelDropdownOpen(false);
    const unit = getFuelUnitPrice(fuel);
    const l = parseFloat(refuelLiters);
    if (!isNaN(l) && l > 0 && unit > 0) setRefuelOriginalAmount(String(Math.round(l * unit)));
  };

  const handleAddRefuel = async () => {
    const target = vehicles.find((v) => v.id === refuelVehicleId) || vehicles[0];
    if (!target) {
      Alert.alert('提醒', '請先新增至少一輛車！');
      return;
    }
    const liters = parseFloat(refuelLiters);
    const origAmt = parseFloat(refuelOriginalAmount);
    const discAmt = refuelDiscountedAmount.trim() ? parseFloat(refuelDiscountedAmount) : NaN;
    const paidAmt = !isNaN(discAmt) && discAmt > 0 ? discAmt : origAmt;
    const odo = parseInt(refuelKm, 10);

    if (!liters || !origAmt || !odo) {
      Alert.alert('提醒', '請完整填寫公升數（或原價金額）與當前里程！');
      return;
    }
    Keyboard.dismiss();

    let calcKmL: number | undefined;
    if (odo > target.mileage && liters > 0) {
      calcKmL = Number(((odo - target.mileage) / liters).toFixed(1));
    }

    const fuelObj = FUEL_OPTIONS.find((f) => f.key === refuelFuelType) || FUEL_OPTIONS[1];
    const newLog: RefuelLog = {
      id: String(Date.now()),
      vehicleId: target.id,
      vehicleName: target.nickname,
      date: new Date().toLocaleDateString('zh-TW'),
      fuelType: refuelFuelType,
      fuelLabel: fuelObj.label,
      unitPrice: getFuelUnitPrice(refuelFuelType),
      liters,
      originalAmount: origAmt,
      paidAmount: paidAmt,
      odometer: odo,
      kmPerLiter: calcKmL,
    };

    const nextLogs = [newLog, ...refuelLogs];
    setRefuelLogs(nextLogs);
    await saveLocalRefuels(nextLogs);

    const nextVehicles = vehicles.map((v) =>
      v.id === target.id
        ? {
            ...v,
            mileage: Math.max(v.mileage, odo),
            avgFuel: calcKmL && calcKmL > 2 && calcKmL < 120 ? calcKmL : v.avgFuel,
          }
        : v
    );
    setVehicles(nextVehicles);
    const ts = await saveLocalVehicles(nextVehicles);
    localUpdatedAtRef.current = ts;
    pushGarageToCloud(sessionToken, nextVehicles, nextLogs, maintLogs, prefs, region, ts);

    setRefuelModalVisible(false);
    setRefuelLiters('');
    setRefuelOriginalAmount('');
    setRefuelDiscountedAmount('');
    setRefuelKm('');

    const savedDiff = origAmt > paidAmt ? `\n自助折扣省下：NT$ ${Math.round(origAmt - paidAmt)}` : '';
    Alert.alert(
      '加油記帳已儲存 ⛽',
      `車輛：${target.nickname}\n油品：${fuelObj.label}\n公升數：${liters} L\n實付金額：NT$ ${paidAmt}${savedDiff}` +
        (calcKmL ? `\n本次實測油耗：${calcKmL} km/L` : '')
    );
  };

  // -------------------- 多項目保養紀錄 --------------------
  const addMaintSubItem = (nameToAdd?: string, costToAdd?: string) => {
    const nm = (nameToAdd !== undefined ? nameToAdd : maintCustomName).trim();
    if (!nm) {
      Alert.alert('提醒', '請輸入保養或維修項目名稱！');
      return;
    }
    const c = parseFloat(costToAdd !== undefined ? costToAdd : maintCustomCost) || 0;
    setMaintDraftItems((prev) => [...prev, { id: `${Date.now()}-${Math.random()}`, name: nm, cost: c }]);
    if (nameToAdd === undefined) {
      setMaintCustomName('');
      setMaintCustomCost('');
    }
  };

  const updateMaintItemCost = (id: string, val: string) => {
    const c = parseFloat(val) || 0;
    setMaintDraftItems((prev) => prev.map((it) => (it.id === id ? { ...it, cost: c } : it)));
  };

  const removeMaintSubItem = (id: string) => {
    setMaintDraftItems((prev) => prev.filter((it) => it.id !== id));
  };

  const handleSaveMaint = async () => {
    const target = vehicles.find((v) => v.id === maintVehicleId) || vehicles[0];
    if (!target) return;
    if (maintDraftItems.length === 0) {
      Alert.alert('提醒', '請至少新增一項保養或維修項目！');
      return;
    }
    Keyboard.dismiss();
    const odo = parseInt(maintKm, 10) || target.mileage;
    const totalCost = maintDraftItems.reduce((sum, it) => sum + it.cost, 0);

    const newLog: MaintLog = {
      id: String(Date.now()),
      vehicleId: target.id,
      vehicleName: target.nickname,
      date: new Date().toLocaleDateString('zh-TW'),
      items: maintDraftItems,
      totalCost,
      odometer: odo,
    };
    const nextLogs = [newLog, ...maintLogs];
    setMaintLogs(nextLogs);
    await saveLocalMaints(nextLogs);

    const interval = target.category === 'scooter' ? 2000 : 5000;
    const nextVehicles = vehicles.map((v) =>
      v.id === target.id ? { ...v, mileage: Math.max(v.mileage, odo), nextMaintKm: odo + interval } : v
    );
    setVehicles(nextVehicles);
    const ts = await saveLocalVehicles(nextVehicles);
    localUpdatedAtRef.current = ts;
    pushGarageToCloud(sessionToken, nextVehicles, refuelLogs, nextLogs, prefs, region, ts);

    setMaintModalVisible(false);
    setMaintDraftItems([]);
    setMaintCustomName('');
    setMaintCustomCost('');
    setMaintKm('');
    Alert.alert(
      '保養紀錄已儲存 🔧',
      `車輛：${target.nickname}\n共 ${newLog.items.length} 項維修/保養\n總金額：NT$ ${totalCost.toLocaleString()}`
    );
  };

  // -------------------- 保險 & 定檢日期儲存 --------------------
  const handleSaveInsurance = async () => {
    if (insExpiryInput.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(insExpiryInput.trim())) {
      Alert.alert('格式錯誤', '強制險到期日請輸入 YYYY-MM-DD（例如：2027-05-20）');
      return;
    }
    Keyboard.dismiss();
    const next = vehicles.map((v) =>
      v.id === insVehicleId ? { ...v, insuranceExpiry: insExpiryInput.trim() } : v
    );
    await persistVehiclesAndSync(next);
    setInsuranceModalVisible(false);
    Alert.alert('已更新 🛡️', '強制險到期日已儲存！');
  };

  const handleSaveInspection = async () => {
    if (inspMfgInput.trim() && !/^\d{4}-\d{2}$/.test(inspMfgInput.trim())) {
      Alert.alert('格式錯誤', '出廠年月請輸入 YYYY-MM（例如：2020-08）');
      return;
    }
    if (inspLastDateInput.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(inspLastDateInput.trim())) {
      Alert.alert('格式錯誤', '上次定檢日期請輸入 YYYY-MM-DD（例如：2026-08-12）');
      return;
    }
    Keyboard.dismiss();
    const next = vehicles.map((v) =>
      v.id === inspVehicleId
        ? { ...v, manufactureYM: inspMfgInput.trim(), lastInspectionDate: inspLastDateInput.trim() }
        : v
    );
    await persistVehiclesAndSync(next);
    setInspectionModalVisible(false);
    Alert.alert('已更新 ✅', '車輛出廠年月與定檢紀錄已儲存！');
  };

  // -------------------- 車牌查詢 & 考照雷達 --------------------
  const runPlateSearch = async (queryOverride?: string, typeOverride?: CarTypeOption) => {
    const q = queryOverride !== undefined ? queryOverride : plateQuery;
    const ct = typeOverride !== undefined ? typeOverride : selectedCarType;
    setPlateLoading(true);
    try {
      const res = await searchLivePlates(q, ct.apiValue, sessionToken);
      setPlateResults(res.plates);
      setPlateTotal(res.total);
      setPlateUpdatedTime(res.updated_time);
    } catch (err) {
      Alert.alert('查詢失敗', getReadableError(err, '無法連線至車牌資料庫'));
    } finally {
      setPlateLoading(false);
    }
  };

  const openPlateSearchModal = () => {
    setPlateModalVisible(true);
    runPlateSearch(plateQuery, selectedCarType);
  };

  const handleFavoritePlate = async (item: PlateResult) => {
    if (!sessionToken) {
      Alert.alert('請先登入', '登入 Google 帳號後即可將心儀車牌加入收藏清單！', [
        { text: '稍後', style: 'cancel' },
        { text: '前往登入', onPress: () => { setPlateModalVisible(false); setActiveTab('profile'); } },
      ]);
      return;
    }
    try {
      const ok = await addUserFavorite(
        sessionToken,
        item.plate_number,
        selectedCarType.apiValue,
        item.motor_vehicles_office
      );
      if (ok) {
        Alert.alert('收藏成功 ❤️', `已將【${item.plate_number}】加入您的收藏清單！`);
        syncBackendAccount(sessionToken, vehicles, refuelLogs, maintLogs, prefs, region, localUpdatedAtRef.current);
      } else {
        Alert.alert('提示', '此車牌可能已在您的收藏清單中。');
      }
    } catch (err) {
      Alert.alert('收藏失敗', getReadableError(err));
    }
  };

  const runExamRadar = async (ltOverride?: string) => {
    const lt = ltOverride !== undefined ? ltOverride : examLicenseType;
    setExamLoading(true);
    try {
      const res = await fetchExamSlots(lt);
      setExamSlots(res.slots.filter((s) => !s.is_full && s.quota > 0));
      setExamAvailCount(res.available_slots);
    } catch (err) {
      Alert.alert('連線失敗', getReadableError(err, '無法取得監理站考照名額'));
    } finally {
      setExamLoading(false);
    }
  };

  const openExamRadarModal = () => {
    setExamModalVisible(true);
    runExamRadar(examLicenseType);
  };

  const displayName = prefs.customNickname.trim() || user?.name || '鍋巴車友';
  const filteredRegions = TAIWAN_REGIONS.filter((r) =>
    regionSearch.trim() ? r.name.includes(regionSearch.trim()) : true
  );
  const filteredExamSlots = examSlots
    .filter((s) => {
      if (!examFilterText.trim()) return true;
      const kw = examFilterText.trim();
      return s.station_name.includes(kw) || s.div_name.includes(kw) || s.raw_date.includes(kw);
    })
    .slice(0, 40);

  const totalFuelSpent = refuelLogs.reduce((acc, r) => acc + r.paidAmount, 0);
  const totalFuelLiters = refuelLogs.reduce((acc, r) => acc + r.liters, 0);
  const maintDraftTotal = maintDraftItems.reduce((sum, it) => sum + it.cost, 0);

  const activeRefuelVehicle = vehicles.find((v) => v.id === refuelVehicleId) || vehicles[0];
  const activeMaintVehicle = vehicles.find((v) => v.id === maintVehicleId) || vehicles[0];
  const activeInsVehicle = vehicles.find((v) => v.id === insVehicleId) || vehicles[0];
  const activeInspVehicle = vehicles.find((v) => v.id === inspVehicleId) || vehicles[0];

  return (
    <LinearGradient
      colors={['#FFF5F9', '#FCE7F3', '#FDE8F3', '#FFF0F6']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.rootGradient}
    >
      <View style={styles.ambientOrbTopRight} pointerEvents="none" />
      <View style={styles.ambientOrbBottomLeft} pointerEvents="none" />

      {/* 地圖分頁：首次開啟後常駐保留（切分頁只隱藏不釋放，回來 0 延遲秒開） */}
      {hasOpenedMapTab && (
        <View
          style={[
            StyleSheet.absoluteFill,
            activeTab !== 'map' && { opacity: 0, zIndex: -1 },
          ]}
          pointerEvents={activeTab === 'map' ? 'auto' : 'none'}
        >
          <NavigationScreen
            initialCenter={{ lat: region.lat, lon: region.lon }}
            embeddedInTab
            openFleetTrigger={openFleetTrigger}
            weatherTemp={weather?.temp ?? null}
            onTabBarVisibilityChange={setMapTabBarVisible}
            onClose={() => setActiveTab('home')}
          />
        </View>
      )}

      <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
        <StatusBar style="dark" />

        {/* ==================== 頂部導覽列（地圖分頁直接全螢幕顯示 GOBA Maps，不顯示多餘頂部標題） ==================== */}
        {activeTab === 'map' ? null : activeTab === 'home' ? (
          <View style={styles.homeTopBar}>
            <View style={styles.brandRow}>
              <Image source={require('./assets/icon-small.png')} style={styles.topMascotLogo} />
              <Text style={styles.homeBrandTitle}>鍋巴 GOBA</Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TouchableOpacity style={styles.regionTopPill} onPress={() => setRegionModalVisible(true)}>
                <Ionicons name={region.isGps ? 'navigate' : 'location'} size={13} color="#DB2777" />
                <Text style={styles.regionTopPillText} numberOfLines={1}>
                  {region.name}
                </Text>
                <Ionicons name="chevron-down" size={13} color="#9D174D" />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconCircleBtn}
                onPress={() =>
                  Alert.alert(
                    '即時資訊 🔔',
                    `• ${region.name} 目前 ${weather?.temp ?? '--'}°C ${weather?.desc ?? ''}\n• 台灣中油 95 無鉛牌價 $${oilPrices?.price95 ?? '--'}/L`
                  )
                }
              >
                <Ionicons name="notifications-outline" size={20} color="#831843" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.centeredTopBar}>
            <View style={{ width: 38 }} />
            <Text style={styles.centeredTitle}>
              {activeTab === 'garage'
                ? '我的車庫'
                : activeTab === 'services'
                ? '服務'
                : '我的'}
            </Text>
            {activeTab === 'garage' ? (
              <TouchableOpacity style={styles.addCircleBtn} onPress={() => setAddVehicleModalVisible(true)}>
                <Ionicons name="add" size={22} color="#DB2777" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 38 }} />
            )}
          </View>
        )}

        {/* ==================== 5 大模組分頁 ==================== */}
        {activeTab === 'map' ? null : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor="#EC4899" />
            }
          >
            {activeTab === 'home' && (
              <HomeTab
                region={region}
                weather={weather}
                aqi={aqi}
                oilPrices={oilPrices}
                loadingLive={loadingLive}
                liveError={liveError}
                prefs={prefs}
                onRefresh={onPullRefresh}
                onOpenRegionModal={() => setRegionModalVisible(true)}
                onSelectTab={setActiveTab}
                onOpenMapWithCategory={() => {
                  setActiveTab('map');
                }}
                onOpenExamModal={openExamRadarModal}
                onOpenPlateModal={openPlateSearchModal}
              />
            )}

            {activeTab === 'garage' && (
              <GarageTab
                vehicles={vehicles}
                vehicleFilter={vehicleFilter}
                onChangeFilter={setVehicleFilter}
                onOpenAddVehicle={() => setAddVehicleModalVisible(true)}
                onDeleteVehicle={handleDeleteVehicle}
                onOpenRefuel={(vid) => {
                  if (vid) setRefuelVehicleId(vid);
                  else if (vehicles.length > 0 && !vehicles.find((v) => v.id === refuelVehicleId)) {
                    setRefuelVehicleId(vehicles[0].id);
                  }
                  setRefuelModalVisible(true);
                }}
                onOpenMaint={(vid) => {
                  if (vid) setMaintVehicleId(vid);
                  else if (vehicles.length > 0 && !vehicles.find((v) => v.id === maintVehicleId)) {
                    setMaintVehicleId(vehicles[0].id);
                  }
                  setMaintModalVisible(true);
                }}
                onOpenStats={() => setStatsModalVisible(true)}
                onOpenInsurance={(vid) => {
                  const target = vehicles.find((v) => v.id === (vid || insVehicleId)) || vehicles[0];
                  if (target) {
                    setInsVehicleId(target.id);
                    setInsExpiryInput(target.insuranceExpiry || '');
                  }
                  setInsuranceModalVisible(true);
                }}
                onOpenInspection={(vid) => {
                  const target = vehicles.find((v) => v.id === (vid || inspVehicleId)) || vehicles[0];
                  if (target) {
                    setInspVehicleId(target.id);
                    setInspMfgInput(target.manufactureYM || '');
                    setInspLastDateInput(target.lastInspectionDate || '');
                  }
                  setInspectionModalVisible(true);
                }}
                cloudSyncStatus={cloudSyncStatus}
              />
            )}

            {activeTab === 'services' && (
              <ServicesTab
                region={region}
                aqi={aqi}
                onOpenExamModal={openExamRadarModal}
                onOpenPlateModal={openPlateSearchModal}
                onOpenFleetModal={() => {
                  setActiveTab('map');
                  setOpenFleetTrigger((c) => c + 1);
                }}
                onSelectTab={setActiveTab}
              />
            )}

            {activeTab === 'profile' && (
              <ProfileTab
                appVersion={APP_VERSION}
                user={user}
                displayName={displayName}
                userTasksCount={userTasks.length}
                userFavorites={userFavorites}
                isLoadingAuth={isLoadingAuth}
                region={region}
                cloudSyncStatus={cloudSyncStatus}
                isSyncingCloud={isSyncingCloud}
                onGoogleLogin={handleGoogleLogin}
                onLogout={handleLogout}
                onDeleteAccount={handleDeleteAccount}
                onOpenAccountSettings={() => {
                  setDraftNickname(prefs.customNickname || user?.name || '');
                  setAccountSettingsVisible(true);
                }}
                onOpenRegionModal={() => setRegionModalVisible(true)}
                onManualCloudSync={() => {
                  if (sessionToken) {
                    pushGarageToCloud(
                      sessionToken,
                      vehicles,
                      refuelLogs,
                      maintLogs,
                      prefs,
                      region,
                      Date.now()
                    );
                  }
                }}
              />
            )}
          </ScrollView>
        )}

        {/* ==================== 浮空 Apple 原生 Liquid Glass 底部導覽列 ==================== */}
        {(activeTab !== 'map' || mapTabBarVisible) && (
        <View style={styles.liquidTabOuter}>
          <LiquidGlassSurface
            variant="sakura"
            interactive
            borderRadius={32}
            contentStyle={styles.liquidTabBlur}
          >
            {[
              { key: 'home', label: '首頁', icon: 'home', activeIcon: 'home' },
              { key: 'garage', label: '車庫', icon: 'car-outline', activeIcon: 'car' },
              { key: 'map', label: '地圖', icon: 'location-outline', activeIcon: 'location' },
              { key: 'services', label: '服務', icon: 'grid-outline', activeIcon: 'grid' },
              { key: 'profile', label: '我的', icon: 'person-outline', activeIcon: 'person' },
            ].map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[styles.liquidTabItem, isActive && styles.liquidTabItemActive]}
                  activeOpacity={0.75}
                  onPress={() => setActiveTab(tab.key as TabType)}
                >
                  <Ionicons
                    name={(isActive ? tab.activeIcon : tab.icon) as any}
                    size={21}
                    color={isActive ? '#EC4899' : '#7C6270'}
                  />
                  <Text style={[styles.liquidTabLabel, isActive && styles.liquidTabLabelActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </LiquidGlassSurface>
        </View>
        )}

        {/* ==================== 地區與 GPS 定位 Modal ==================== */}
        <Modal visible={regionModalVisible} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <BlurView intensity={95} tint="light" style={[styles.modalGlassSheet, { maxHeight: '82%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>📍 選擇地區與定位</Text>
                <TouchableOpacity onPress={() => setRegionModalVisible(false)}>
                  <Ionicons name="close-circle" size={26} color="#9D174D" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.gpsActionBtn} onPress={handleUseGpsLocation} disabled={gpsLoading}>
                {gpsLoading ? (
                  <ActivityIndicator color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="locate" size={18} color="#FFF" />
                    <Text style={styles.gpsActionBtnText}>使用目前 GPS 位置（自動定位）</Text>
                  </>
                )}
              </TouchableOpacity>

              <TextInput
                style={[styles.textInput, { marginTop: 12, marginBottom: 8 }]}
                placeholder="搜尋台灣縣市（例如：台北、台中、高雄、桃園）"
                value={regionSearch}
                onChangeText={setRegionSearch}
              />

              <ScrollView style={{ maxHeight: 330 }} keyboardShouldPersistTaps="handled">
                {filteredRegions.map((r) => {
                  const isCurr = region.name === r.name && !region.isGps;
                  return (
                    <TouchableOpacity
                      key={r.name}
                      style={[styles.regionRowItem, isCurr && styles.regionRowItemActive]}
                      onPress={() => selectRegion(r)}
                    >
                      <Text style={[styles.regionRowText, isCurr && { color: '#DB2777', fontWeight: '900' }]}>
                        {r.name}
                      </Text>
                      {isCurr && <Ionicons name="checkmark-circle" size={18} color="#DB2777" />}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </BlurView>
          </KeyboardAvoidingView>
        </Modal>

        {/* ==================== 帳戶資訊設定 Modal ==================== */}
        <Modal visible={accountSettingsVisible} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <BlurView intensity={95} tint="light" style={[styles.modalGlassSheet, { maxHeight: '85%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>⚙️ 帳戶資訊設定</Text>
                <TouchableOpacity onPress={() => setAccountSettingsVisible(false)}>
                  <Ionicons name="close-circle" size={26} color="#9D174D" />
                </TouchableOpacity>
              </View>

              <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
                <Text style={styles.inputLabel}>顯示暱稱</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="輸入您在 App 內顯示的暱稱"
                  value={draftNickname}
                  onChangeText={setDraftNickname}
                />

                {user && (
                  <>
                    <Text style={styles.inputLabel}>綁定信箱</Text>
                    <View style={styles.readOnlyField}>
                      <Text style={{ color: '#6B7280', fontSize: 13 }}>{user.email}</Text>
                    </View>
                  </>
                )}

                <Text style={styles.inputLabel}>常用油品（將於首頁油價高亮標示）</Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  {[
                    { key: '92' as FuelPref, label: '92 無鉛' },
                    { key: '95' as FuelPref, label: '95 無鉛' },
                    { key: '98' as FuelPref, label: '98 無鉛' },
                    { key: 'diesel' as FuelPref, label: '超柴' },
                  ].map((f) => {
                    const active = prefs.preferredFuel === f.key;
                    return (
                      <TouchableOpacity
                        key={f.key}
                        style={[styles.fuelPrefChip, active && styles.fuelPrefChipActive]}
                        onPress={() => saveAccountPrefsAndSync({ ...prefs, preferredFuel: f.key })}
                      >
                        <Text style={[styles.fuelPrefText, active && { color: '#FFF' }]}>{f.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={[styles.inputLabel, { marginTop: 16 }]}>通知偏好</Text>
                <View style={styles.switchRow}>
                  <Text style={styles.settingText}>中油官方油價更新通知</Text>
                  <Switch
                    value={prefs.notifyOil}
                    onValueChange={(val) => saveAccountPrefsAndSync({ ...prefs, notifyOil: val })}
                    trackColor={{ true: '#F472B6' }}
                  />
                </View>
                <View style={styles.switchRow}>
                  <Text style={styles.settingText}>強制險到期前提醒</Text>
                  <Switch
                    value={prefs.notifyInsurance}
                    onValueChange={(val) => saveAccountPrefsAndSync({ ...prefs, notifyInsurance: val })}
                    trackColor={{ true: '#F472B6' }}
                  />
                </View>
                <View style={styles.switchRow}>
                  <Text style={styles.settingText}>愛車保養里程提醒</Text>
                  <Switch
                    value={prefs.notifyMaint}
                    onValueChange={(val) => saveAccountPrefsAndSync({ ...prefs, notifyMaint: val })}
                    trackColor={{ true: '#F472B6' }}
                  />
                </View>

                <TouchableOpacity
                  style={styles.primaryPinkBtn}
                  onPress={async () => {
                    Keyboard.dismiss();
                    await saveAccountPrefsAndSync({ ...prefs, customNickname: draftNickname.trim() });
                    setAccountSettingsVisible(false);
                    Alert.alert('已儲存 ✨', '您的帳戶資訊與個人偏好設定已更新！');
                  }}
                >
                  <Text style={styles.primaryPinkBtnText}>儲存帳戶設定</Text>
                </TouchableOpacity>
              </ScrollView>
            </BlurView>
          </KeyboardAvoidingView>
        </Modal>

        <PlateAndExamModals
          plateModalVisible={plateModalVisible}
          onClosePlateModal={() => setPlateModalVisible(false)}
          selectedCarType={selectedCarType}
          onSelectCarType={setSelectedCarType}
          plateQuery={plateQuery}
          onChangePlateQuery={setPlateQuery}
          onRunPlateSearch={runPlateSearch}
          plateTotal={plateTotal}
          plateUpdatedTime={plateUpdatedTime}
          plateLoading={plateLoading}
          plateResults={plateResults}
          onFavoritePlate={handleFavoritePlate}
          examModalVisible={examModalVisible}
          onCloseExamModal={() => setExamModalVisible(false)}
          examLicenseType={examLicenseType}
          onSelectExamLicenseType={(code) => {
            setExamLicenseType(code);
            runExamRadar(code);
          }}
          examFilterText={examFilterText}
          onChangeExamFilterText={setExamFilterText}
          examAvailCount={examAvailCount}
          examLoading={examLoading}
          filteredExamSlots={filteredExamSlots}
        />

        <GarageModals
          vehicles={vehicles}
          insuranceModalVisible={insuranceModalVisible}
          onCloseInsuranceModal={() => setInsuranceModalVisible(false)}
          insVehicleId={insVehicleId}
          onChangeInsVehicleId={setInsVehicleId}
          insVehicleDropdownOpen={insVehicleDropdownOpen}
          onToggleInsVehicleDropdown={() => setInsVehicleDropdownOpen((o) => !o)}
          activeInsVehicle={activeInsVehicle}
          insExpiryInput={insExpiryInput}
          onChangeInsExpiryInput={setInsExpiryInput}
          onSaveInsurance={handleSaveInsurance}
          inspectionModalVisible={inspectionModalVisible}
          onCloseInspectionModal={() => setInspectionModalVisible(false)}
          inspVehicleId={inspVehicleId}
          onChangeInspVehicleId={setInspVehicleId}
          inspVehicleDropdownOpen={inspVehicleDropdownOpen}
          onToggleInspVehicleDropdown={() => setInspVehicleDropdownOpen((o) => !o)}
          activeInspVehicle={activeInspVehicle}
          inspMfgInput={inspMfgInput}
          onChangeInspMfgInput={setInspMfgInput}
          inspLastDateInput={inspLastDateInput}
          onChangeInspLastDateInput={setInspLastDateInput}
          onSaveInspection={handleSaveInspection}
          refuelModalVisible={refuelModalVisible}
          onCloseRefuelModal={() => setRefuelModalVisible(false)}
          refuelVehicleId={refuelVehicleId}
          onChangeRefuelVehicleId={setRefuelVehicleId}
          refuelVehicleDropdownOpen={refuelVehicleDropdownOpen}
          onToggleRefuelVehicleDropdown={setRefuelVehicleDropdownOpen}
          activeRefuelVehicle={activeRefuelVehicle}
          refuelFuelType={refuelFuelType}
          refuelFuelDropdownOpen={refuelFuelDropdownOpen}
          onToggleRefuelFuelDropdown={setRefuelFuelDropdownOpen}
          getFuelUnitPrice={getFuelUnitPrice}
          onSelectRefuelFuelType={onSelectRefuelFuelType}
          refuelLiters={refuelLiters}
          onChangeRefuelLiters={onChangeRefuelLiters}
          refuelOriginalAmount={refuelOriginalAmount}
          onChangeRefuelOriginalAmount={onChangeRefuelOriginalAmount}
          refuelDiscountedAmount={refuelDiscountedAmount}
          onChangeRefuelDiscountedAmount={setRefuelDiscountedAmount}
          refuelKm={refuelKm}
          onChangeRefuelKm={setRefuelKm}
          onAddRefuel={handleAddRefuel}
          maintModalVisible={maintModalVisible}
          onCloseMaintModal={() => setMaintModalVisible(false)}
          maintVehicleId={maintVehicleId}
          onChangeMaintVehicleId={setMaintVehicleId}
          maintVehicleDropdownOpen={maintVehicleDropdownOpen}
          onToggleMaintVehicleDropdown={() => setMaintVehicleDropdownOpen((o) => !o)}
          activeMaintVehicle={activeMaintVehicle}
          maintCustomName={maintCustomName}
          onChangeMaintCustomName={setMaintCustomName}
          maintCustomCost={maintCustomCost}
          onChangeMaintCustomCost={setMaintCustomCost}
          maintDraftItems={maintDraftItems}
          maintDraftTotal={maintDraftTotal}
          onAddMaintSubItem={addMaintSubItem}
          onUpdateMaintItemCost={updateMaintItemCost}
          onRemoveMaintSubItem={removeMaintSubItem}
          maintKm={maintKm}
          onChangeMaintKm={setMaintKm}
          onSaveMaint={handleSaveMaint}
          statsModalVisible={statsModalVisible}
          onCloseStatsModal={() => setStatsModalVisible(false)}
          totalFuelSpent={totalFuelSpent}
          totalFuelLiters={totalFuelLiters}
          refuelLogs={refuelLogs}
          maintLogs={maintLogs}
          addVehicleModalVisible={addVehicleModalVisible}
          onCloseAddVehicleModal={() => setAddVehicleModalVisible(false)}
          newVehicleCategory={newVehicleCategory}
          onChangeNewVehicleCategory={setNewVehicleCategory}
          newVehicleName={newVehicleName}
          onChangeNewVehicleName={setNewVehicleName}
          newVehiclePlate={newVehiclePlate}
          onChangeNewVehiclePlate={setNewVehiclePlate}
          newVehicleKm={newVehicleKm}
          onChangeNewVehicleKm={setNewVehicleKm}
          newVehicleMfgYM={newVehicleMfgYM}
          onChangeNewVehicleMfgYM={setNewVehicleMfgYM}
          newVehicleLastInsp={newVehicleLastInsp}
          onChangeNewVehicleLastInsp={setNewVehicleLastInsp}
          newVehicleInsExpiry={newVehicleInsExpiry}
          onChangeNewVehicleInsExpiry={setNewVehicleInsExpiry}
          onAddVehicle={handleAddVehicle}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}
