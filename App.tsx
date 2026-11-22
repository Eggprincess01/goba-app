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
import MapView from 'react-native-maps';

import { styles } from './styles/theme';
import {
  AccountPrefs,
  COMMON_MAINT_ITEMS,
  DEFAULT_PREFS,
  FUEL_OPTIONS,
  FuelPref,
  MaintLog,
  MaintSubItem,
  MapCategory,
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
  MapPOI,
  LiveTrafficData,
  fetchLiveWeather,
  fetchLiveAqi,
  fetchLiveOilPrices,
  fetchAuthMe,
  logoutAuth,
  searchLivePlates,
  fetchExamSlots,
  fetchUserTasks,
  fetchUserFavorites,
  addUserFavorite,
  fetchNearbyPOIs,
  fetchLiveTraffic,
  fetchCloudGarage,
  pushCloudGarage,
  calcDaysUntilDate,
  calcInspectionStatus,
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
import { MapTab } from './components/MapTab';
import { ServicesTab } from './components/ServicesTab';
import { ProfileTab } from './components/ProfileTab';

WebBrowser.maybeCompleteAuthSession();

// P0 #3: 統一由 app.json 單一來源讀取版本號
const APP_VERSION = Constants.expoConfig?.version || '1.1.0';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [region, setRegion] = useState<RegionInfo>(TAIWAN_REGIONS[3]);
  const [refreshing, setRefreshing] = useState(false);

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

  // 內建真實地圖 + 高公局 1968 即時路況
  const mapRef = useRef<MapView | null>(null);
  const poiReqIdRef = useRef(0);
  const [mapCategory, setMapCategory] = useState<MapCategory>('gas');
  const [gasBrandFilter, setGasBrandFilter] = useState('全部');
  const [mapPois, setMapPois] = useState<MapPOI[]>([]);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<MapPOI | null>(null);

  const [trafficData, setTrafficData] = useState<LiveTrafficData | null>(null);
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [trafficError, setTrafficError] = useState<string | null>(null);
  const [trafficSubTab, setTrafficSubTab] = useState<'speeds' | 'incidents'>('speeds');

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

  // -------------------- 地圖與高公局 1968 即時路況 --------------------
  const loadLiveTraffic = useCallback(async () => {
    setTrafficLoading(true);
    setTrafficError(null);
    try {
      const data = await fetchLiveTraffic();
      setTrafficData(data);
    } catch (err) {
      setTrafficError(getReadableError(err, '無法取得高公局即時路況'));
    } finally {
      setTrafficLoading(false);
    }
  }, []);

  const loadMapPois = useCallback(
    async (lat: number, lon: number, cat: MapCategory) => {
      if (cat === 'traffic') {
        loadLiveTraffic();
        return;
      }
      const reqId = ++poiReqIdRef.current;
      setMapLoading(true);
      setMapError(null);
      try {
        const pois = await fetchNearbyPOIs(lat, lon, cat);
        if (reqId === poiReqIdRef.current && pois.length > 0) {
          setMapPois(pois);
        }
      } catch (err) {
        if (reqId === poiReqIdRef.current) {
          setMapError(getReadableError(err, '無法取得周邊站點資料'));
        }
      } finally {
        if (reqId === poiReqIdRef.current) {
          setMapLoading(false);
        }
      }
    },
    [loadLiveTraffic]
  );

  useEffect(() => {
    if (activeTab === 'map') {
      loadMapPois(region.lat, region.lon, mapCategory);
    }
  }, [activeTab, mapCategory, region.lat, region.lon, loadMapPois]);

  // -------------------- Deep Link 登入回調 --------------------
  const handleAuthCallbackUrl = useCallback(
    async (url: string) => {
      if (!url || !url.startsWith('goba://')) return;
      const tokenMatch = url.match(/[?&]token=([^&]+)/);
      const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : '';
      if (token) {
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
    if (activeTab === 'map') {
      mapRef.current?.animateToRegion(
        { latitude: nextRegion.lat, longitude: nextRegion.lon, latitudeDelta: 0.035, longitudeDelta: 0.035 },
        450
      );
    }
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

  const openPoiNavigation = (poi: MapPOI) => {
    const url =
      Platform.OS === 'ios'
        ? `maps://?daddr=${poi.lat},${poi.lon}&q=${encodeURIComponent(poi.name)}`
        : `https://www.google.com/maps/dir/?api=1&destination=${poi.lat},${poi.lon}`;
    Linking.openURL(url).catch(() => {});
  };

  const focusPoiOnMap = (poi: MapPOI) => {
    setSelectedPoi(poi);
    mapRef.current?.animateToRegion(
      { latitude: poi.lat, longitude: poi.lon, latitudeDelta: 0.012, longitudeDelta: 0.012 },
      400
    );
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

      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />

        {/* ==================== 頂部導覽列 ==================== */}
        {activeTab === 'home' ? (
          <View style={styles.homeTopBar}>
            <View style={styles.brandRow}>
              <Image source={require('./assets/icon.png')} style={styles.topMascotLogo} />
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
                : activeTab === 'map'
                ? '交通地圖'
                : activeTab === 'services'
                ? '服務'
                : '我的'}
            </Text>
            {activeTab === 'garage' ? (
              <TouchableOpacity style={styles.addCircleBtn} onPress={() => setAddVehicleModalVisible(true)}>
                <Ionicons name="add" size={22} color="#DB2777" />
              </TouchableOpacity>
            ) : activeTab === 'map' ? (
              <TouchableOpacity style={styles.addCircleBtn} onPress={handleUseGpsLocation} disabled={gpsLoading}>
                {gpsLoading ? (
                  <ActivityIndicator size="small" color="#DB2777" />
                ) : (
                  <Ionicons name="locate" size={20} color="#DB2777" />
                )}
              </TouchableOpacity>
            ) : (
              <View style={{ width: 38 }} />
            )}
          </View>
        )}

        {/* ==================== 5 大模組分頁 ==================== */}
        {activeTab === 'map' ? (
          <MapTab
            mapRef={mapRef}
            region={region}
            mapCategory={mapCategory}
            onChangeCategory={setMapCategory}
            gasBrandFilter={gasBrandFilter}
            onChangeGasBrand={setGasBrandFilter}
            mapPois={mapPois}
            mapLoading={mapLoading}
            mapError={mapError}
            selectedPoi={selectedPoi}
            onSelectPoi={setSelectedPoi}
            onFocusPoi={focusPoiOnMap}
            onNavigatePoi={openPoiNavigation}
            onRetryPois={() => loadMapPois(region.lat, region.lon, mapCategory)}
            trafficData={trafficData}
            trafficLoading={trafficLoading}
            trafficError={trafficError}
            trafficSubTab={trafficSubTab}
            onChangeTrafficSubTab={setTrafficSubTab}
            onRefreshTraffic={loadLiveTraffic}
            onOpenRegionModal={() => setRegionModalVisible(true)}
          />
        ) : (
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
                onOpenMapWithCategory={(cat) => {
                  setMapCategory(cat);
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
                onOpenMapWithCategory={(cat) => {
                  setMapCategory(cat);
                  setActiveTab('map');
                }}
                onSelectTab={setActiveTab}
                onOpenRegionModal={() => setRegionModalVisible(true)}
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

        {/* ==================== 保險到期提醒 Modal ==================== */}
        <Modal visible={insuranceModalVisible} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <BlurView intensity={95} tint="light" style={[styles.modalGlassSheet, { maxHeight: '85%' }]}>
              <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>🛡️ 強制險到期日設定</Text>
                  <TouchableOpacity onPress={() => setInsuranceModalVisible(false)}>
                    <Ionicons name="close-circle" size={26} color="#9D174D" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.inputLabel}>選擇車輛</Text>
                <TouchableOpacity
                  style={styles.dropdownTrigger}
                  onPress={() => setInsVehicleDropdownOpen(!insVehicleDropdownOpen)}
                >
                  <Text style={styles.dropdownTriggerText}>
                    {activeInsVehicle ? `${activeInsVehicle.nickname} (${activeInsVehicle.plate})` : '請選擇車輛'}
                  </Text>
                  <Ionicons name={insVehicleDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#9D174D" />
                </TouchableOpacity>
                {insVehicleDropdownOpen && (
                  <View style={styles.dropdownList}>
                    {vehicles.map((v) => (
                      <TouchableOpacity
                        key={v.id}
                        style={styles.dropdownOption}
                        onPress={() => {
                          setInsVehicleId(v.id);
                          setInsExpiryInput(v.insuranceExpiry || '');
                          setInsVehicleDropdownOpen(false);
                        }}
                      >
                        <Text style={styles.dropdownOptionText}>{v.nickname} ({v.plate})</Text>
                        {v.id === insVehicleId && <Ionicons name="checkmark" size={16} color="#DB2777" />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <View style={styles.statusBoxCard}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#5B2333' }}>
                    目前狀態：
                    {(() => {
                      const d = calcDaysUntilDate(insExpiryInput);
                      if (d === null) return '尚未設定到期日';
                      return d < 0 ? `已過期 ${Math.abs(d)} 天 ⚠️` : `距離到期還有 ${d} 天`;
                    })()}
                  </Text>
                </View>

                <Text style={styles.inputLabel}>強制險到期日 (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="例如：2027-05-20"
                  value={insExpiryInput}
                  onChangeText={setInsExpiryInput}
                />

                <TouchableOpacity style={styles.primaryPinkBtn} onPress={handleSaveInsurance}>
                  <Text style={styles.primaryPinkBtnText}>儲存保險到期日</Text>
                </TouchableOpacity>
              </ScrollView>
            </BlurView>
          </KeyboardAvoidingView>
        </Modal>

        {/* ==================== 驗車 / 排氣定檢 Modal ==================== */}
        <Modal visible={inspectionModalVisible} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <BlurView intensity={95} tint="light" style={[styles.modalGlassSheet, { maxHeight: '85%' }]}>
              <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>✅ 驗車 / 排氣定檢設定</Text>
                  <TouchableOpacity onPress={() => setInspectionModalVisible(false)}>
                    <Ionicons name="close-circle" size={26} color="#9D174D" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.inputLabel}>選擇車輛</Text>
                <TouchableOpacity
                  style={styles.dropdownTrigger}
                  onPress={() => setInspVehicleDropdownOpen(!inspVehicleDropdownOpen)}
                >
                  <Text style={styles.dropdownTriggerText}>
                    {activeInspVehicle ? `${activeInspVehicle.nickname} (${activeInspVehicle.plate})` : '請選擇車輛'}
                  </Text>
                  <Ionicons name={inspVehicleDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#9D174D" />
                </TouchableOpacity>
                {inspVehicleDropdownOpen && (
                  <View style={styles.dropdownList}>
                    {vehicles.map((v) => (
                      <TouchableOpacity
                        key={v.id}
                        style={styles.dropdownOption}
                        onPress={() => {
                          setInspVehicleId(v.id);
                          setInspMfgInput(v.manufactureYM || '');
                          setInspLastDateInput(v.lastInspectionDate || '');
                          setInspVehicleDropdownOpen(false);
                        }}
                      >
                        <Text style={styles.dropdownOptionText}>{v.nickname} ({v.plate})</Text>
                        {v.id === inspVehicleId && <Ionicons name="checkmark" size={16} color="#DB2777" />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {activeInspVehicle &&
                  (() => {
                    const st = calcInspectionStatus(activeInspVehicle.category, inspMfgInput, inspLastDateInput);
                    return (
                      <View style={styles.statusBoxCard}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: st.isDueSoon ? '#DC2626' : '#059669' }}>
                          {st.statusText}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#6B4C5A', marginTop: 3 }}>{st.detail}</Text>
                      </View>
                    );
                  })()}

                <Text style={styles.inputLabel}>出廠年月 (YYYY-MM)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="例如：2020-06"
                  value={inspMfgInput}
                  onChangeText={setInspMfgInput}
                />

                <Text style={styles.inputLabel}>上次定檢日期 (YYYY-MM-DD，選填)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="例如：2026-06-15"
                  value={inspLastDateInput}
                  onChangeText={setInspLastDateInput}
                />

                <TouchableOpacity style={styles.primaryPinkBtn} onPress={handleSaveInspection}>
                  <Text style={styles.primaryPinkBtnText}>儲存出廠年月與定檢日期</Text>
                </TouchableOpacity>
              </ScrollView>
            </BlurView>
          </KeyboardAvoidingView>
        </Modal>

        {/* ==================== 車牌查詢 Modal ==================== */}
        <Modal visible={plateModalVisible} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <BlurView intensity={95} tint="light" style={[styles.modalGlassSheet, { maxHeight: '88%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>🚙 全台車牌即時查詢</Text>
                <TouchableOpacity onPress={() => setPlateModalVisible(false)}>
                  <Ionicons name="close-circle" size={26} color="#9D174D" />
                </TouchableOpacity>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                {PLATE_CAR_TYPES.map((ct) => {
                  const active = selectedCarType.apiValue === ct.apiValue;
                  return (
                    <TouchableOpacity
                      key={ct.apiValue}
                      style={[styles.chipBtn, active && styles.chipBtnActive]}
                      onPress={() => {
                        setSelectedCarType(ct);
                        runPlateSearch(plateQuery, ct);
                      }}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{ct.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.searchRow}>
                <TextInput
                  style={[styles.textInput, { flex: 1, marginRight: 8 }]}
                  placeholder="輸入心儀號碼（留空看全部）"
                  autoCapitalize="characters"
                  value={plateQuery}
                  onChangeText={setPlateQuery}
                  onSubmitEditing={() => {
                    Keyboard.dismiss();
                    runPlateSearch();
                  }}
                />
                <TouchableOpacity
                  style={styles.searchGoBtn}
                  onPress={() => {
                    Keyboard.dismiss();
                    runPlateSearch();
                  }}
                >
                  <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13 }}>查詢</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.resultMeta}>
                【{selectedCarType.label}】共 {plateTotal} 筆在庫{' '}
                {plateUpdatedTime ? `• 更新 ${plateUpdatedTime}` : ''}
              </Text>

              {plateLoading ? (
                <ActivityIndicator size="large" color="#EC4899" style={{ marginVertical: 28 }} />
              ) : (
                <ScrollView style={{ maxHeight: 330 }} keyboardShouldPersistTaps="handled">
                  {plateResults.length === 0 ? (
                    <Text style={styles.emptyText}>
                      【{selectedCarType.shortTag}】目前無符合「{plateQuery}」的在庫號牌
                    </Text>
                  ) : (
                    plateResults.map((p, idx) => (
                      <View key={`${p.plate_number}-${idx}`} style={styles.plateResultRow}>
                        <View>
                          <View
                            style={[
                              styles.authenticPlateBadge,
                              { backgroundColor: selectedCarType.plateBg, borderColor: selectedCarType.plateBorder },
                            ]}
                          >
                            <Text style={[styles.authenticPlateText, { color: selectedCarType.plateText }]}>
                              {p.plate_number}
                            </Text>
                          </View>
                          <Text style={styles.plateOfficeText}>{p.motor_vehicles_office}</Text>
                        </View>
                        <TouchableOpacity style={styles.favSmallBtn} onPress={() => handleFavoritePlate(p)}>
                          <Ionicons name="heart-outline" size={16} color="#DB2777" />
                          <Text style={styles.favSmallText}>收藏</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </ScrollView>
              )}
            </BlurView>
          </KeyboardAvoidingView>
        </Modal>

        {/* ==================== 考照雷達 Modal ==================== */}
        <Modal visible={examModalVisible} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <BlurView intensity={95} tint="light" style={[styles.modalGlassSheet, { maxHeight: '86%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>🏍️ 全台考照即時名額</Text>
                <TouchableOpacity onPress={() => setExamModalVisible(false)}>
                  <Ionicons name="close-circle" size={26} color="#9D174D" />
                </TouchableOpacity>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginVertical: 8 }}>
                {[
                  { code: '3', label: '普通重機' },
                  { code: '5', label: '普通輕機' },
                  { code: 'A', label: '自用小客車' },
                ].map((lt) => (
                  <TouchableOpacity
                    key={lt.code}
                    style={[styles.chipBtn, examLicenseType === lt.code && styles.chipBtnActive]}
                    onPress={() => {
                      setExamLicenseType(lt.code);
                      runExamRadar(lt.code);
                    }}
                  >
                    <Text style={[styles.chipText, examLicenseType === lt.code && styles.chipTextActive]}>
                      {lt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TextInput
                style={styles.textInput}
                placeholder="輸入監理站關鍵字篩選（如 士林、板橋、桃園、台中）"
                value={examFilterText}
                onChangeText={setExamFilterText}
              />

              <Text style={styles.resultMeta}>
                全台即時可報名場次：{examAvailCount} 場（顯示前 40 筆）
              </Text>

              {examLoading ? (
                <ActivityIndicator size="large" color="#EC4899" style={{ marginVertical: 28 }} />
              ) : (
                <ScrollView style={{ maxHeight: 300 }} keyboardShouldPersistTaps="handled">
                  {filteredExamSlots.length === 0 ? (
                    <Text style={styles.emptyText}>查無符合篩選條件的可報名場次</Text>
                  ) : (
                    filteredExamSlots.map((slot, idx) => (
                      <View key={`${slot.station_name}-${slot.date}-${idx}`} style={styles.plateResultRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.examStationTitle}>{slot.station_name}</Text>
                          <Text style={styles.plateOfficeText}>
                            {slot.raw_date} • {slot.session_name} {slot.exam_time}
                          </Text>
                        </View>
                        <View style={styles.quotaGreenBadge}>
                          <Text style={styles.quotaGreenText}>剩 {slot.quota} 名</Text>
                        </View>
                      </View>
                    ))
                  )}
                </ScrollView>
              )}

              <TouchableOpacity
                style={styles.primaryPinkBtn}
                onPress={() => Linking.openURL('https://exam.mmlovenn.com')}
              >
                <Text style={styles.primaryPinkBtnText}>前往 exam.mmlovenn.com 立即預約</Text>
              </TouchableOpacity>
            </BlurView>
          </KeyboardAvoidingView>
        </Modal>

        {/* ==================== 加油記帳 Modal ==================== */}
        <Modal visible={refuelModalVisible} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <BlurView intensity={95} tint="light" style={[styles.modalGlassSheet, { maxHeight: '88%' }]}>
              <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>⛽ 新增加油紀錄</Text>
                  <TouchableOpacity onPress={() => setRefuelModalVisible(false)}>
                    <Ionicons name="close-circle" size={26} color="#9D174D" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.inputLabel}>選擇車輛</Text>
                <TouchableOpacity
                  style={styles.dropdownTrigger}
                  onPress={() => {
                    setRefuelVehicleDropdownOpen(!refuelVehicleDropdownOpen);
                    setRefuelFuelDropdownOpen(false);
                  }}
                >
                  <Text style={styles.dropdownTriggerText}>
                    {activeRefuelVehicle ? `${activeRefuelVehicle.nickname} (${activeRefuelVehicle.plate})` : '請選擇車輛'}
                  </Text>
                  <Ionicons name={refuelVehicleDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#9D174D" />
                </TouchableOpacity>
                {refuelVehicleDropdownOpen && (
                  <View style={styles.dropdownList}>
                    {vehicles.map((v) => (
                      <TouchableOpacity
                        key={v.id}
                        style={styles.dropdownOption}
                        onPress={() => {
                          setRefuelVehicleId(v.id);
                          setRefuelVehicleDropdownOpen(false);
                        }}
                      >
                        <Text style={styles.dropdownOptionText}>{v.nickname} ({v.plate})</Text>
                        {v.id === refuelVehicleId && <Ionicons name="checkmark" size={16} color="#DB2777" />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <Text style={styles.inputLabel}>選擇油品（依今日中油牌價自動換算）</Text>
                <TouchableOpacity
                  style={styles.dropdownTrigger}
                  onPress={() => {
                    setRefuelFuelDropdownOpen(!refuelFuelDropdownOpen);
                    setRefuelVehicleDropdownOpen(false);
                  }}
                >
                  <Text style={styles.dropdownTriggerText}>
                    {FUEL_OPTIONS.find((f) => f.key === refuelFuelType)?.label}（${getFuelUnitPrice(refuelFuelType) || '--'}/L）
                  </Text>
                  <Ionicons name={refuelFuelDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#9D174D" />
                </TouchableOpacity>
                {refuelFuelDropdownOpen && (
                  <View style={styles.dropdownList}>
                    {FUEL_OPTIONS.map((f) => (
                      <TouchableOpacity
                        key={f.key}
                        style={styles.dropdownOption}
                        onPress={() => onSelectRefuelFuelType(f.key)}
                      >
                        <Text style={styles.dropdownOptionText}>
                          {f.label} — ${getFuelUnitPrice(f.key) || '--'}/L
                        </Text>
                        {f.key === refuelFuelType && <Ionicons name="checkmark" size={16} color="#DB2777" />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>加油公升數 (L)</Text>
                    <TextInput
                      style={styles.textInput}
                      keyboardType="decimal-pad"
                      placeholder="輸入自動算金額"
                      value={refuelLiters}
                      onChangeText={onChangeRefuelLiters}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>原價金額 (NT$)</Text>
                    <TextInput
                      style={styles.textInput}
                      keyboardType="numeric"
                      placeholder="輸入自動算公升"
                      value={refuelOriginalAmount}
                      onChangeText={onChangeRefuelOriginalAmount}
                    />
                  </View>
                </View>

                <Text style={styles.inputLabel}>折扣後實付金額 (NT$，選填 — 自助加油折扣用)</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  placeholder="無折扣可留空，將以原價金額計算"
                  value={refuelDiscountedAmount}
                  onChangeText={setRefuelDiscountedAmount}
                />

                <Text style={styles.inputLabel}>當前儀表總里程 (km)</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  placeholder={`前次里程：${activeRefuelVehicle?.mileage || 0}`}
                  value={refuelKm}
                  onChangeText={setRefuelKm}
                />

                <TouchableOpacity style={styles.primaryPinkBtn} onPress={handleAddRefuel}>
                  <Text style={styles.primaryPinkBtnText}>儲存並計算實測油耗</Text>
                </TouchableOpacity>
              </ScrollView>
            </BlurView>
          </KeyboardAvoidingView>
        </Modal>

        {/* ==================== 保養紀錄 Modal ==================== */}
        <Modal visible={maintModalVisible} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <BlurView intensity={95} tint="light" style={[styles.modalGlassSheet, { maxHeight: '90%' }]}>
              <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>🔧 新增保養 / 維修紀錄</Text>
                  <TouchableOpacity onPress={() => setMaintModalVisible(false)}>
                    <Ionicons name="close-circle" size={26} color="#9D174D" />
                  </TouchableOpacity>
                </View>

                <Text style={styles.inputLabel}>選擇車輛</Text>
                <TouchableOpacity
                  style={styles.dropdownTrigger}
                  onPress={() => setMaintVehicleDropdownOpen(!maintVehicleDropdownOpen)}
                >
                  <Text style={styles.dropdownTriggerText}>
                    {activeMaintVehicle ? `${activeMaintVehicle.nickname} (${activeMaintVehicle.plate})` : '請選擇車輛'}
                  </Text>
                  <Ionicons name={maintVehicleDropdownOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#9D174D" />
                </TouchableOpacity>
                {maintVehicleDropdownOpen && (
                  <View style={styles.dropdownList}>
                    {vehicles.map((v) => (
                      <TouchableOpacity
                        key={v.id}
                        style={styles.dropdownOption}
                        onPress={() => {
                          setMaintVehicleId(v.id);
                          setMaintVehicleDropdownOpen(false);
                        }}
                      >
                        <Text style={styles.dropdownOptionText}>{v.nickname} ({v.plate})</Text>
                        {v.id === maintVehicleId && <Ionicons name="checkmark" size={16} color="#DB2777" />}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                <Text style={styles.inputLabel}>快速點選加入常見項目</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
                  {COMMON_MAINT_ITEMS.map((itemName) => (
                    <TouchableOpacity
                      key={itemName}
                      style={styles.chipBtn}
                      onPress={() => addMaintSubItem(itemName, '0')}
                    >
                      <Text style={styles.chipText}>+ {itemName}</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <Text style={styles.inputLabel}>或自行新增維修 / 保養項目</Text>
                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <TextInput
                    style={[styles.textInput, { flex: 1.6 }]}
                    placeholder="項目名稱（例：更換碟盤）"
                    value={maintCustomName}
                    onChangeText={setMaintCustomName}
                  />
                  <TextInput
                    style={[styles.textInput, { flex: 0.9 }]}
                    keyboardType="numeric"
                    placeholder="費用"
                    value={maintCustomCost}
                    onChangeText={setMaintCustomCost}
                  />
                  <TouchableOpacity style={styles.addSubItemBtn} onPress={() => addMaintSubItem()}>
                    <Ionicons name="add" size={20} color="#FFF" />
                  </TouchableOpacity>
                </View>

                {maintDraftItems.length > 0 && (
                  <View style={styles.maintListBox}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 12, fontWeight: '800', color: '#5B2333' }}>
                        本次項目明細 ({maintDraftItems.length} 項)
                      </Text>
                      <Text style={{ fontSize: 12, fontWeight: '900', color: '#DB2777' }}>
                        合計 NT$ {maintDraftTotal.toLocaleString()}
                      </Text>
                    </View>
                    {maintDraftItems.map((it) => (
                      <View key={it.id} style={styles.maintSubItemRow}>
                        <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#3B1525' }}>
                          • {it.name}
                        </Text>
                        <TextInput
                          style={styles.miniPriceInput}
                          keyboardType="numeric"
                          placeholder="$"
                          value={it.cost > 0 ? String(it.cost) : ''}
                          onChangeText={(val) => updateMaintItemCost(it.id, val)}
                        />
                        <TouchableOpacity onPress={() => removeMaintSubItem(it.id)} style={{ marginLeft: 8 }}>
                          <Ionicons name="trash-outline" size={18} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={styles.inputLabel}>保養當下里程 (km)</Text>
                <TextInput
                  style={styles.textInput}
                  keyboardType="numeric"
                  placeholder={`目前里程：${activeMaintVehicle?.mileage || 0}`}
                  value={maintKm}
                  onChangeText={setMaintKm}
                />

                <TouchableOpacity style={styles.primaryPinkBtn} onPress={handleSaveMaint}>
                  <Text style={styles.primaryPinkBtnText}>
                    儲存保養紀錄（共 NT$ {maintDraftTotal.toLocaleString()}）
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </BlurView>
          </KeyboardAvoidingView>
        </Modal>

        {/* ==================== 油耗與歷史明細 Modal ==================== */}
        <Modal visible={statsModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <BlurView intensity={92} tint="light" style={[styles.modalGlassSheet, { maxHeight: '78%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>📊 油耗與歷史明細</Text>
                <TouchableOpacity onPress={() => setStatsModalVisible(false)}>
                  <Ionicons name="close-circle" size={26} color="#9D174D" />
                </TouchableOpacity>
              </View>

              <View style={styles.quotaRow}>
                <View style={styles.quotaCol}>
                  <Text style={styles.quotaVal}>${totalFuelSpent}</Text>
                  <Text style={styles.quotaLbl}>實付油資</Text>
                </View>
                <View style={styles.oilColDivider} />
                <View style={styles.quotaCol}>
                  <Text style={[styles.quotaVal, { color: '#DB2777' }]}>{totalFuelLiters.toFixed(1)} L</Text>
                  <Text style={styles.quotaLbl}>累積加油</Text>
                </View>
                <View style={styles.oilColDivider} />
                <View style={styles.quotaCol}>
                  <Text style={[styles.quotaVal, { color: '#059669' }]}>{maintLogs.length} 次</Text>
                  <Text style={styles.quotaLbl}>保養紀錄</Text>
                </View>
              </View>

              <ScrollView style={{ marginTop: 14, maxHeight: 280 }}>
                {refuelLogs.length === 0 && maintLogs.length === 0 ? (
                  <Text style={styles.emptyText}>尚未有加油或保養紀錄</Text>
                ) : (
                  <>
                    {refuelLogs.map((log) => (
                      <View key={log.id} style={styles.plateResultRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.examStationTitle}>
                            ⛽ {log.vehicleName}（{log.fuelLabel}）
                          </Text>
                          <Text style={styles.plateOfficeText}>
                            {log.date} • {log.liters}L • 里程 {log.odometer} km
                          </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ fontWeight: '900', color: '#BE185D' }}>NT$ {log.paidAmount}</Text>
                          {log.originalAmount > log.paidAmount && (
                            <Text style={{ fontSize: 10, color: '#059669' }}>
                              省 ${Math.round(log.originalAmount - log.paidAmount)}
                            </Text>
                          )}
                          {log.kmPerLiter ? (
                            <Text style={{ fontSize: 11, color: '#059669', fontWeight: '700' }}>
                              {log.kmPerLiter} km/L
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    ))}
                    {maintLogs.map((m) => (
                      <View key={m.id} style={styles.plateResultRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.examStationTitle}>🔧 {m.vehicleName}</Text>
                          <Text style={styles.plateOfficeText}>
                            {m.date} • {m.items.map((x) => x.name).join('、')}
                          </Text>
                        </View>
                        <Text style={{ fontWeight: '900', color: '#5B2333' }}>NT$ {m.totalCost}</Text>
                      </View>
                    ))}
                  </>
                )}
              </ScrollView>
            </BlurView>
          </View>
        </Modal>

        {/* ==================== 新增車輛 Modal ==================== */}
        <Modal visible={addVehicleModalVisible} transparent animationType="slide">
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlay}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <BlurView intensity={95} tint="light" style={[styles.modalGlassSheet, { maxHeight: '90%' }]}>
              <ScrollView keyboardShouldPersistTaps="handled" bounces={false}>
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>✨ 新增愛車到車庫</Text>
                  <TouchableOpacity onPress={() => setAddVehicleModalVisible(false)}>
                    <Ionicons name="close-circle" size={26} color="#9D174D" />
                  </TouchableOpacity>
                </View>

                <View style={styles.categorySwitchRow}>
                  <TouchableOpacity
                    style={[styles.catBtn, newVehicleCategory === 'scooter' && styles.catBtnActive]}
                    onPress={() => setNewVehicleCategory('scooter')}
                  >
                    <Text style={[styles.catBtnText, newVehicleCategory === 'scooter' && styles.catBtnTextActive]}>
                      🏍️ 機車 / 重機
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.catBtn, newVehicleCategory === 'car' && styles.catBtnActive]}
                    onPress={() => setNewVehicleCategory('car')}
                  >
                    <Text style={[styles.catBtnText, newVehicleCategory === 'car' && styles.catBtnTextActive]}>
                      🚗 汽車
                    </Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.inputLabel}>愛車名稱 / 型號 *</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="例如：MMBCU 158 或 Honda Civic"
                  value={newVehicleName}
                  onChangeText={setNewVehicleName}
                />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>車牌號碼 *</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="例：PHP-9969"
                      autoCapitalize="characters"
                      value={newVehiclePlate}
                      onChangeText={setNewVehiclePlate}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>目前里程 (km)</Text>
                    <TextInput
                      style={styles.textInput}
                      keyboardType="numeric"
                      placeholder="例：5200"
                      value={newVehicleKm}
                      onChangeText={setNewVehicleKm}
                    />
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>出廠年月 (YYYY-MM)</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="例：2021-06"
                      value={newVehicleMfgYM}
                      onChangeText={setNewVehicleMfgYM}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.inputLabel}>上次定檢 (選填)</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="YYYY-MM-DD"
                      value={newVehicleLastInsp}
                      onChangeText={setNewVehicleLastInsp}
                    />
                  </View>
                </View>

                <Text style={styles.inputLabel}>強制險到期日 (YYYY-MM-DD，選填)</Text>
                <TextInput
                  style={styles.textInput}
                  placeholder="例：2027-05-20（未填則顯示尚未設定）"
                  value={newVehicleInsExpiry}
                  onChangeText={setNewVehicleInsExpiry}
                />

                <TouchableOpacity style={styles.primaryPinkBtn} onPress={handleAddVehicle}>
                  <Text style={styles.primaryPinkBtnText}>確認加入我的車庫</Text>
                </TouchableOpacity>
              </ScrollView>
            </BlurView>
          </KeyboardAvoidingView>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}
