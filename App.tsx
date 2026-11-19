import React, { useState, useEffect, useCallback } from 'react';
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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  API_BASE,
  TAIWAN_CITIES,
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
  searchLivePlates,
  fetchExamSlots,
  fetchUserTasks,
  fetchUserFavorites,
  addUserFavorite,
} from './services/api';

WebBrowser.maybeCompleteAuthSession();

type TabType = 'home' | 'garage' | 'map' | 'services' | 'profile';
type VehicleFilter = 'all' | 'scooter' | 'car';
type MapCategory = 'gas' | 'traffic' | 'parking' | 'dmv';

interface VehicleItem {
  id: string;
  nickname: string;
  plate: string;
  category: 'scooter' | 'car';
  typeLabel: string;
  mileage: number;
  nextMaintKm: number;
  avgFuel: number;
  insuranceDays: number;
  accentColor: string;
}

interface RefuelLog {
  id: string;
  vehicleId: string;
  vehicleName: string;
  date: string;
  liters: number;
  amount: number;
  odometer: number;
  kmPerLiter?: number;
}

interface MaintLog {
  id: string;
  vehicleId: string;
  vehicleName: string;
  date: string;
  item: string;
  cost: number;
  odometer: number;
}

const STORAGE_KEYS = {
  TOKEN: 'goba_session_token',
  USER: 'goba_user_profile',
  VEHICLES: 'goba_vehicles_v1',
  REFUELS: 'goba_refuels_v1',
  MAINTS: 'goba_maints_v1',
};

const DEFAULT_VEHICLES: VehicleItem[] = [
  {
    id: '1',
    nickname: 'Kawasaki Ninja 400',
    plate: '9969',
    category: 'scooter',
    typeLabel: '大型重型機車',
    mileage: 12860,
    nextMaintKm: 15000,
    avgFuel: 26.4,
    insuranceDays: 45,
    accentColor: '#16A34A',
  },
  {
    id: '2',
    nickname: 'JET SL+ 158',
    plate: '9969',
    category: 'scooter',
    typeLabel: '普通重型機車',
    mileage: 8320,
    nextMaintKm: 10000,
    avgFuel: 39.2,
    insuranceDays: 28,
    accentColor: '#EC4899',
  },
];

const PLATE_CAR_TYPES = ['普通重型機車', '自用小客車', '大型重型機車', '電動普通重型機車'];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [cityIndex, setCityIndex] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  // 即時真實資料狀態
  const [weather, setWeather] = useState<LiveWeather | null>(null);
  const [aqi, setAqi] = useState<LiveAqi | null>(null);
  const [oilPrices, setOilPrices] = useState<LiveOilPrices | null>(null);
  const [loadingLive, setLoadingLive] = useState(true);

  // 真實登入狀態（與網站 mmlovenn.com 互通）
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [userTasks, setUserTasks] = useState<any[]>([]);
  const [userFavorites, setUserFavorites] = useState<any[]>([]);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);

  // 車庫持久化資料
  const [vehicleFilter, setVehicleFilter] = useState<VehicleFilter>('all');
  const [vehicles, setVehicles] = useState<VehicleItem[]>(DEFAULT_VEHICLES);
  const [refuelLogs, setRefuelLogs] = useState<RefuelLog[]>([]);
  const [maintLogs, setMaintLogs] = useState<MaintLog[]>([]);

  // 地圖分類狀態
  const [mapCategory, setMapCategory] = useState<MapCategory>('gas');

  // 彈窗狀態：加油、保養、油耗統計、新增車輛
  const [refuelModalVisible, setRefuelModalVisible] = useState(false);
  const [selectedVehicleIdx, setSelectedVehicleIdx] = useState(0);
  const [refuelLiters, setRefuelLiters] = useState('');
  const [refuelAmount, setRefuelAmount] = useState('');
  const [refuelKm, setRefuelKm] = useState('');

  const [maintModalVisible, setMaintModalVisible] = useState(false);
  const [maintItem, setMaintItem] = useState('更換機油');
  const [maintCost, setMaintCost] = useState('');
  const [maintKm, setMaintKm] = useState('');

  const [statsModalVisible, setStatsModalVisible] = useState(false);

  const [addVehicleModalVisible, setAddVehicleModalVisible] = useState(false);
  const [newVehicleName, setNewVehicleName] = useState('');
  const [newVehiclePlate, setNewVehiclePlate] = useState('');
  const [newVehicleKm, setNewVehicleKm] = useState('');
  const [newVehicleCategory, setNewVehicleCategory] = useState<'scooter' | 'car'>('scooter');

  // 內建真實「車牌查詢」Modal
  const [plateModalVisible, setPlateModalVisible] = useState(false);
  const [plateQuery, setPlateQuery] = useState('9969');
  const [plateCarType, setPlateCarType] = useState('普通重型機車');
  const [plateResults, setPlateResults] = useState<PlateResult[]>([]);
  const [plateTotal, setPlateTotal] = useState(0);
  const [plateUpdatedTime, setPlateUpdatedTime] = useState('');
  const [plateLoading, setPlateLoading] = useState(false);

  // 內建真實「考照名額雷達」Modal
  const [examModalVisible, setExamModalVisible] = useState(false);
  const [examLicenseType, setExamLicenseType] = useState('3');
  const [examFilterText, setExamFilterText] = useState('');
  const [examSlots, setExamSlots] = useState<ExamSlot[]>([]);
  const [examAvailCount, setExamAvailCount] = useState(0);
  const [examLoading, setExamLoading] = useState(false);

  const city = TAIWAN_CITIES[cityIndex];

  // -------------------- 載入真實即時天氣、AQI、中油油價 --------------------
  const loadLiveData = useCallback(async (cIdx: number) => {
    const targetCity = TAIWAN_CITIES[cIdx];
    try {
      const [wRes, aRes, oRes] = await Promise.allSettled([
        fetchLiveWeather(targetCity.lat, targetCity.lon),
        fetchLiveAqi(targetCity.lat, targetCity.lon),
        fetchLiveOilPrices(),
      ]);
      if (wRes.status === 'fulfilled') setWeather(wRes.value);
      if (aRes.status === 'fulfilled') setAqi(aRes.value);
      if (oRes.status === 'fulfilled') setOilPrices(oRes.value);
    } finally {
      setLoadingLive(false);
    }
  }, []);

  // -------------------- 同步網站會員資料（/api/auth/me + 任務 + 收藏） --------------------
  const syncBackendAccount = useCallback(async (token: string) => {
    try {
      const profile = await fetchAuthMe(token);
      if (profile) {
        setUser(profile);
        setSessionToken(token);
        await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(profile));
        const [tasks, favs] = await Promise.all([
          fetchUserTasks(token),
          fetchUserFavorites(token),
        ]);
        setUserTasks(tasks);
        setUserFavorites(favs);
        return profile;
      } else {
        await AsyncStorage.removeItem(STORAGE_KEYS.TOKEN);
        await AsyncStorage.removeItem(STORAGE_KEYS.USER);
        setUser(null);
        setSessionToken(null);
      }
    } catch {
      // 保留快取
    }
    return null;
  }, []);

  // -------------------- 啟動初始化 --------------------
  useEffect(() => {
    const bootstrap = async () => {
      try {
        const [savedToken, savedUser, savedVehicles, savedRefuels, savedMaints] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.TOKEN),
          AsyncStorage.getItem(STORAGE_KEYS.USER),
          AsyncStorage.getItem(STORAGE_KEYS.VEHICLES),
          AsyncStorage.getItem(STORAGE_KEYS.REFUELS),
          AsyncStorage.getItem(STORAGE_KEYS.MAINTS),
        ]);
        if (savedVehicles) setVehicles(JSON.parse(savedVehicles));
        if (savedRefuels) setRefuelLogs(JSON.parse(savedRefuels));
        if (savedMaints) setMaintLogs(JSON.parse(savedMaints));
        if (savedUser) setUser(JSON.parse(savedUser));
        if (savedToken) {
          setSessionToken(savedToken);
          syncBackendAccount(savedToken);
        }
      } catch {
        // ignore
      }
    };
    bootstrap();
    loadLiveData(0);
  }, [loadLiveData, syncBackendAccount]);

  useEffect(() => {
    loadLiveData(cityIndex);
  }, [cityIndex, loadLiveData]);

  // 監聽外部 Deep Link（備援）
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      handleAuthCallbackUrl(url);
    });
    Linking.getInitialURL().then((url) => {
      if (url) handleAuthCallbackUrl(url);
    });
    return () => sub.remove();
  }, []);

  const handleAuthCallbackUrl = async (url: string) => {
    if (!url || !url.startsWith('goba://')) return;
    const tokenMatch = url.match(/[?&]token=([^&]+)/);
    const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : '';
    if (token) {
      await AsyncStorage.setItem(STORAGE_KEYS.TOKEN, token);
      const profile = await syncBackendAccount(token);
      if (profile) {
        Alert.alert('登入成功 🎉', `歡迎回來，${profile.name}！\n已與網站 mmlovenn.com 帳號即時互通。`);
      }
    }
  };

  // -------------------- 真實 Google 一鍵登入（ASWebAuthenticationSession） --------------------
  const handleGoogleLogin = async () => {
    setIsLoadingAuth(true);
    try {
      const authUrl = `${API_BASE}/api/auth/login-bridge?return_to=${encodeURIComponent('goba://auth')}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, 'goba://');
      if (result.type === 'success' && result.url) {
        await handleAuthCallbackUrl(result.url);
      } else if (result.type !== 'cancel' && result.type !== 'dismiss') {
        Alert.alert('提示', '登入視窗未完成授權，請再試一次！');
      }
    } catch (err) {
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
          await AsyncStorage.multiRemove([STORAGE_KEYS.TOKEN, STORAGE_KEYS.USER]);
          setSessionToken(null);
          setUser(null);
          setUserTasks([]);
          setUserFavorites([]);
          Alert.alert('已登出', '您已安全登出鍋巴 GOBA。');
        },
      },
    ]);
  };

  const onPullRefresh = async () => {
    setRefreshing(true);
    await loadLiveData(cityIndex);
    if (sessionToken) await syncBackendAccount(sessionToken);
    setRefreshing(false);
  };

  // -------------------- 車庫持久化操作 --------------------
  const persistVehicles = async (next: VehicleItem[]) => {
    setVehicles(next);
    await AsyncStorage.setItem(STORAGE_KEYS.VEHICLES, JSON.stringify(next));
  };

  const handleAddVehicle = async () => {
    if (!newVehicleName.trim() || !newVehiclePlate.trim()) {
      Alert.alert('提醒', '請輸入車款名稱與車牌號碼！');
      return;
    }
    const kmNum = parseInt(newVehicleKm, 10) || 0;
    const item: VehicleItem = {
      id: String(Date.now()),
      nickname: newVehicleName.trim(),
      plate: newVehiclePlate.trim().toUpperCase(),
      category: newVehicleCategory,
      typeLabel: newVehicleCategory === 'scooter' ? '普通重型機車' : '自用小客車',
      mileage: kmNum,
      nextMaintKm: kmNum + 2000,
      avgFuel: newVehicleCategory === 'scooter' ? 36.0 : 14.5,
      insuranceDays: 180,
      accentColor: newVehicleCategory === 'scooter' ? '#EC4899' : '#2563EB',
    };
    await persistVehicles([item, ...vehicles]);
    setAddVehicleModalVisible(false);
    setNewVehicleName('');
    setNewVehiclePlate('');
    setNewVehicleKm('');
    Alert.alert('新增成功 🎉', `已將【${item.nickname}】永久儲存至您的車庫！`);
  };

  const handleDeleteVehicle = (v: VehicleItem) => {
    Alert.alert('刪除車輛', `確定要從車庫移除【${v.nickname}】嗎？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '移除',
        style: 'destructive',
        onPress: async () => {
          const next = vehicles.filter((item) => item.id !== v.id);
          await persistVehicles(next);
        },
      },
    ]);
  };

  const handleAddRefuel = async () => {
    const target = vehicles[selectedVehicleIdx] || vehicles[0];
    if (!target) {
      Alert.alert('提醒', '請先新增至少一輛車！');
      return;
    }
    const liters = parseFloat(refuelLiters);
    const amount = parseFloat(refuelAmount);
    const odo = parseInt(refuelKm, 10);
    if (!liters || !amount || !odo) {
      Alert.alert('提醒', '請完整填寫正確的公升數、金額與里程數字！');
      return;
    }

    let calcKmL: number | undefined;
    if (odo > target.mileage && liters > 0) {
      calcKmL = Number(((odo - target.mileage) / liters).toFixed(1));
    }

    const newLog: RefuelLog = {
      id: String(Date.now()),
      vehicleId: target.id,
      vehicleName: target.nickname,
      date: new Date().toLocaleDateString('zh-TW'),
      liters,
      amount,
      odometer: odo,
      kmPerLiter: calcKmL,
    };

    const nextLogs = [newLog, ...refuelLogs];
    setRefuelLogs(nextLogs);
    await AsyncStorage.setItem(STORAGE_KEYS.REFUELS, JSON.stringify(nextLogs));

    const nextVehicles = vehicles.map((v) =>
      v.id === target.id
        ? {
            ...v,
            mileage: Math.max(v.mileage, odo),
            avgFuel: calcKmL && calcKmL > 2 && calcKmL < 120 ? calcKmL : v.avgFuel,
          }
        : v
    );
    await persistVehicles(nextVehicles);

    setRefuelModalVisible(false);
    setRefuelLiters('');
    setRefuelAmount('');
    setRefuelKm('');
    Alert.alert(
      '加油記帳已儲存 ⛽',
      `車輛：${target.nickname}\n加油：${liters} L / NT$ ${amount}` +
        (calcKmL ? `\n本次實測油耗：${calcKmL} km/L ✨` : '')
    );
  };

  const handleAddMaint = async () => {
    const target = vehicles[selectedVehicleIdx] || vehicles[0];
    if (!target) return;
    const cost = parseFloat(maintCost) || 0;
    const odo = parseInt(maintKm, 10) || target.mileage;
    const newLog: MaintLog = {
      id: String(Date.now()),
      vehicleId: target.id,
      vehicleName: target.nickname,
      date: new Date().toLocaleDateString('zh-TW'),
      item: maintItem.trim() || '定期保養',
      cost,
      odometer: odo,
    };
    const nextLogs = [newLog, ...maintLogs];
    setMaintLogs(nextLogs);
    await AsyncStorage.setItem(STORAGE_KEYS.MAINTS, JSON.stringify(nextLogs));

    const interval = target.category === 'scooter' ? 2000 : 5000;
    const nextVehicles = vehicles.map((v) =>
      v.id === target.id
        ? { ...v, mileage: Math.max(v.mileage, odo), nextMaintKm: odo + interval }
        : v
    );
    await persistVehicles(nextVehicles);

    setMaintModalVisible(false);
    setMaintCost('');
    setMaintKm('');
    Alert.alert('保養紀錄已儲存 🔧', `已更新下次保養提醒里程至 ${(odo + interval).toLocaleString()} km！`);
  };

  // -------------------- 真實車牌查詢 --------------------
  const runPlateSearch = async (queryOverride?: string, typeOverride?: string) => {
    const q = queryOverride !== undefined ? queryOverride : plateQuery;
    const ct = typeOverride !== undefined ? typeOverride : plateCarType;
    setPlateLoading(true);
    try {
      const res = await searchLivePlates(q, ct, sessionToken);
      setPlateResults(res.plates);
      setPlateTotal(res.total);
      setPlateUpdatedTime(res.updated_time);
    } catch {
      Alert.alert('查詢失敗', '無法連線至車牌資料庫，請確認網路狀態後再試！');
    } finally {
      setPlateLoading(false);
    }
  };

  const openPlateSearchModal = () => {
    setPlateModalVisible(true);
    runPlateSearch(plateQuery, plateCarType);
  };

  const handleFavoritePlate = async (item: PlateResult) => {
    if (!sessionToken) {
      Alert.alert('請先登入', '登入 Google 帳號後即可將心儀車牌同步收藏至 mmlovenn.com！', [
        { text: '稍後', style: 'cancel' },
        {
          text: '前往登入',
          onPress: () => {
            setPlateModalVisible(false);
            setActiveTab('profile');
          },
        },
      ]);
      return;
    }
    const ok = await addUserFavorite(
      sessionToken,
      item.plate_number,
      plateCarType,
      item.motor_vehicles_office
    );
    if (ok) {
      Alert.alert('收藏成功 ❤️', `已將【${item.plate_number}】同步加入您的網站收藏清單！`);
      syncBackendAccount(sessionToken);
    } else {
      Alert.alert('提示', '此車牌可能已在您的收藏清單中。');
    }
  };

  // -------------------- 真實考照名額雷達 --------------------
  const runExamRadar = async (ltOverride?: string) => {
    const lt = ltOverride !== undefined ? ltOverride : examLicenseType;
    setExamLoading(true);
    try {
      const res = await fetchExamSlots(lt);
      setExamSlots(res.slots.filter((s) => !s.is_full && s.quota > 0));
      setExamAvailCount(res.available_slots);
    } catch {
      Alert.alert('連線失敗', '無法取得監理站考照名額，請稍後再試！');
    } finally {
      setExamLoading(false);
    }
  };

  const openExamRadarModal = () => {
    setExamModalVisible(true);
    runExamRadar(examLicenseType);
  };

  // -------------------- 開啟 iOS 原生 Apple Maps / Google Maps 真實導航 --------------------
  const openNativeMapsSearch = (query: string) => {
    const fullQuery = `${city.name} ${query}`;
    const url =
      Platform.OS === 'ios'
        ? `maps://?q=${encodeURIComponent(fullQuery)}`
        : `https://maps.google.com/?q=${encodeURIComponent(fullQuery)}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent(fullQuery)}`)
    );
  };

  const filteredVehicles =
    vehicleFilter === 'all' ? vehicles : vehicles.filter((v) => v.category === vehicleFilter);

  const filteredExamSlots = examSlots
    .filter((s) => {
      if (!examFilterText.trim()) return true;
      const kw = examFilterText.trim();
      return s.station_name.includes(kw) || s.div_name.includes(kw) || s.raw_date.includes(kw);
    })
    .slice(0, 40);

  const totalFuelSpent = refuelLogs.reduce((acc, r) => acc + r.amount, 0);
  const totalFuelLiters = refuelLogs.reduce((acc, r) => acc + r.liters, 0);

  const homeQuickActions = [
    { label: '我的車庫', icon: 'car-sport', color: '#EC4899', bg: '#FCE7F3', onPress: () => setActiveTab('garage') },
    {
      label: '油價查詢',
      icon: 'flame',
      color: '#F97316',
      bg: '#FFEDD5',
      onPress: () =>
        Alert.alert(
          `中油即時油價（${oilPrices?.updateDate || '最新'}）`,
          `92 無鉛：$${oilPrices?.price92 || '--'}\n95 無鉛：$${oilPrices?.price95 || '--'}\n98 無鉛：$${oilPrices?.price98 || '--'}\n超級柴油：$${oilPrices?.priceDiesel || '--'}\n\n💡 ${oilPrices?.trendText || ''}`
        ),
    },
    {
      label: '天氣資訊',
      icon: 'partly-sunny',
      color: '#0EA5E9',
      bg: '#E0F2FE',
      onPress: () =>
        Alert.alert(
          `${city.name} 即時氣象`,
          `溫度：${weather?.temp ?? '--'}°C（${weather?.desc ?? '讀取中'}）\n今日高低溫：${weather?.high ?? '--'}°C / ${weather?.low ?? '--'}°C\n降雨機率：${weather?.rainProb ?? '--'}%\n相對濕度：${weather?.humidity ?? '--'}%\n風速：${weather?.windSpeed ?? '--'} km/h\n空氣品質 AQI：${aqi?.usAqi ?? '--'}（${aqi?.label ?? '--'}）`
        ),
    },
    { label: '即時路況', icon: 'navigate-circle', color: '#F43F5E', bg: '#FFE4E6', onPress: () => { setMapCategory('traffic'); setActiveTab('map'); } },
    { label: '考照服務', icon: 'card', color: '#3B82F6', bg: '#DBEAFE', onPress: openExamRadarModal },
    { label: '車牌服務', icon: 'pricetag', color: '#DB2777', bg: '#FCE7F3', onPress: openPlateSearchModal },
    { label: '停車資訊', icon: 'location', color: '#2563EB', bg: '#DBEAFE', onPress: () => openNativeMapsSearch('停車場') },
    { label: '更多服務', icon: 'ellipsis-horizontal-circle', color: '#A855F7', bg: '#F3E8FF', onPress: () => setActiveTab('services') },
  ] as const;

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
            <TouchableOpacity
              style={styles.iconCircleBtn}
              onPress={() =>
                Alert.alert(
                  '即時動態通知 🔔',
                  `• ${city.name} 目前 ${weather?.temp ?? '--'}°C ${weather?.desc ?? ''}\n• 中油 95 無鉛最新牌價 $${oilPrices?.price95 ?? '--'}/L\n• ${user ? `已登入：${user.email}（任務 ${userTasks.length} 筆）` : '尚未登入網站帳號，點擊「我的」一鍵登入'}`
                )
              }
            >
              <Ionicons name="notifications-outline" size={22} color="#831843" />
              <View style={styles.redDot} />
            </TouchableOpacity>
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
              <TouchableOpacity
                style={styles.addCircleBtn}
                onPress={() => setAddVehicleModalVisible(true)}
              >
                <Ionicons name="add" size={22} color="#DB2777" />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 38 }} />
            )}
          </View>
        )}

        {/* ==================== 主要滑動內容區 ==================== */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} tintColor="#EC4899" />
          }
        >
          {/* -------------------- TAB 1: 首頁 -------------------- */}
          {activeTab === 'home' && (
            <View style={styles.sectionStack}>
              {/* 櫻花粉鍋巴主題 Hero Banner */}
              <LinearGradient
                colors={['#BAE6FD', '#FBCFE8', '#FCE7F3']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.heroBanner}
              >
                <View style={styles.heroPetalDecor1} />
                <View style={styles.heroPetalDecor2} />
                <View style={styles.heroMascotWrap}>
                  <Image source={require('./assets/icon.png')} style={styles.heroMascotImg} />
                </View>
                <View style={styles.heroTextCol}>
                  <Text style={styles.heroTitle}>鍋巴 GOBA</Text>
                  <View style={styles.heroSubtitlePill}>
                    <Text style={styles.heroSubtitle}>每一天，鍋巴陪你出發！♡</Text>
                  </View>
                  {user ? (
                    <Text style={styles.heroUserGreeting}>歡迎回來，{user.name} ✨</Text>
                  ) : (
                    <TouchableOpacity onPress={() => setActiveTab('profile')}>
                      <Text style={styles.heroUserGreeting}>點此登入同步網站帳號 ➔</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </LinearGradient>

              {/* 4x2 晶透玻璃快捷方格 */}
              <View style={styles.quickGrid}>
                {homeQuickActions.map((item) => (
                  <TouchableOpacity
                    key={item.label}
                    style={styles.quickTileWrapper}
                    activeOpacity={0.78}
                    onPress={item.onPress}
                  >
                    <BlurView intensity={55} tint="light" style={styles.quickTileGlass}>
                      <View style={[styles.quickIconBox, { backgroundColor: item.bg }]}>
                        <Ionicons name={item.icon as any} size={23} color={item.color} />
                      </View>
                      <Text style={styles.quickTileLabel}>{item.label}</Text>
                    </BlurView>
                  </TouchableOpacity>
                ))}
              </View>

              {/* 今日資訊標題列 */}
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>今日資訊（即時連線）</Text>
                <TouchableOpacity style={styles.refreshBtn} onPress={onPullRefresh}>
                  <Ionicons name="refresh" size={13} color="#9D174D" />
                  <Text style={styles.refreshText}>
                    {loadingLive ? '同步中...' : `更新 ${weather?.updatedAt || '--:--'}`}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 真實即時天氣動態玻璃卡片 */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setCityIndex((cityIndex + 1) % TAIWAN_CITIES.length)}
              >
                <BlurView intensity={65} tint="light" style={styles.glassCard}>
                  <View style={styles.weatherRow}>
                    <View style={styles.weatherLeft}>
                      <View style={styles.weatherIconCircle}>
                        <Ionicons
                          name={(weather?.icon as any) || 'partly-sunny'}
                          size={36}
                          color={weather?.icon === 'rainy' ? '#3B82F6' : '#F59E0B'}
                        />
                      </View>
                      <View style={{ marginLeft: 12 }}>
                        <Text style={styles.weatherLocation}>{city.name} ▾（點我切換）</Text>
                        <Text style={styles.weatherTemp}>
                          {weather ? `${weather.temp}°C` : '--°C'}
                        </Text>
                        <Text style={styles.weatherDesc}>
                          {weather ? `${weather.desc} • 濕度 ${weather.humidity}%` : '即時氣象載入中...'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.weatherRight}>
                      <Text style={styles.weatherHiLo}>
                        <Text style={{ color: '#EF4444', fontWeight: '700' }}>
                          ↑ {weather?.high ?? '--'}°C
                        </Text>
                        {'  '}
                        <Text style={{ color: '#3B82F6', fontWeight: '700' }}>
                          ↓ {weather?.low ?? '--'}°C
                        </Text>
                      </Text>
                      <View style={styles.rainRow}>
                        <Ionicons name="water" size={13} color="#3B82F6" />
                        <Text style={styles.rainText}>降雨 {weather?.rainProb ?? '--'}%</Text>
                      </View>
                      {aqi && (
                        <Text style={{ fontSize: 11, fontWeight: '700', color: aqi.color }}>
                          AQI {aqi.usAqi} {aqi.label}
                        </Text>
                      )}
                    </View>
                  </View>
                </BlurView>
              </TouchableOpacity>

              {/* 真實中油今日油價玻璃卡片 */}
              <BlurView intensity={65} tint="light" style={styles.glassCard}>
                <View style={styles.oilHeaderRow}>
                  <Text style={styles.oilCardTitle}>
                    今日油價 (中油 {oilPrices?.updateDate || '即時'})
                  </Text>
                  <Text style={styles.oilUnit}>元/公升</Text>
                </View>
                <View style={styles.oilColumnsRow}>
                  <View style={styles.oilCol}>
                    <Text style={styles.oilColLabel}>92 無鉛</Text>
                    <Text style={styles.oilColPrice}>{oilPrices?.price92 || '--'}</Text>
                  </View>
                  <View style={styles.oilColDivider} />
                  <View style={styles.oilCol}>
                    <Text style={[styles.oilColLabel, { color: '#BE185D', fontWeight: '700' }]}>95 無鉛</Text>
                    <Text style={[styles.oilColPrice, { color: '#BE185D' }]}>
                      {oilPrices?.price95 || '--'}
                    </Text>
                  </View>
                  <View style={styles.oilColDivider} />
                  <View style={styles.oilCol}>
                    <Text style={styles.oilColLabel}>98 無鉛</Text>
                    <Text style={styles.oilColPrice}>{oilPrices?.price98 || '--'}</Text>
                  </View>
                  <View style={styles.oilColDivider} />
                  <View style={styles.oilCol}>
                    <Text style={styles.oilColLabel}>超柴</Text>
                    <Text style={styles.oilColPrice}>{oilPrices?.priceDiesel || '--'}</Text>
                  </View>
                </View>
                {oilPrices?.trendText ? (
                  <View style={styles.oilTrendBanner}>
                    <Text style={styles.oilTrendText}>💡 {oilPrices.trendText}</Text>
                  </View>
                ) : null}
              </BlurView>
            </View>
          )}

          {/* -------------------- TAB 2: 我的車庫（本機永久儲存） -------------------- */}
          {activeTab === 'garage' && (
            <View style={styles.sectionStack}>
              <BlurView intensity={60} tint="light" style={styles.segmentedBar}>
                {[
                  { key: 'all', label: `全部 (${vehicles.length})` },
                  { key: 'scooter', label: '機車' },
                  { key: 'car', label: '汽車' },
                ].map((seg) => {
                  const active = vehicleFilter === seg.key;
                  return (
                    <TouchableOpacity
                      key={seg.key}
                      style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                      onPress={() => setVehicleFilter(seg.key as VehicleFilter)}
                    >
                      <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                        {seg.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </BlurView>

              {filteredVehicles.map((v, idx) => (
                <BlurView key={v.id} intensity={70} tint="light" style={styles.garageVehicleCard}>
                  <View style={styles.garageTopRow}>
                    <View style={[styles.vehicleThumbBox, { backgroundColor: `${v.accentColor}15` }]}>
                      <MaterialCommunityIcons
                        name={v.category === 'scooter' ? 'motorbike' : 'car'}
                        size={38}
                        color={v.accentColor}
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <View style={styles.vehicleTitleRow}>
                        <Text style={styles.vehicleName}>{v.nickname}</Text>
                        <TouchableOpacity
                          onPress={() =>
                            Alert.alert(
                              v.nickname,
                              `車種：${v.typeLabel}\n平均油耗：${v.avgFuel} km/L\n強制險到期：剩餘 ${v.insuranceDays} 天`,
                              [
                                { text: '關閉', style: 'cancel' },
                                {
                                  text: '⛽ 記一筆加油',
                                  onPress: () => {
                                    setSelectedVehicleIdx(idx);
                                    setRefuelModalVisible(true);
                                  },
                                },
                                {
                                  text: '移除車輛',
                                  style: 'destructive',
                                  onPress: () => handleDeleteVehicle(v),
                                },
                              ]
                            )
                          }
                        >
                          <Ionicons name="ellipsis-horizontal" size={20} color="#9D174D" />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.pinkPlateBadge}>
                        <Text style={styles.pinkPlateText}>{v.plate}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.garageMetaRow}>
                    <View style={styles.garageMetaItem}>
                      <Ionicons name="speedometer-outline" size={14} color="#9D174D" />
                      <Text style={styles.garageMetaText}>里程 {v.mileage.toLocaleString()} km</Text>
                    </View>
                    <View style={styles.garageMetaItem}>
                      <Ionicons name="shield-checkmark-outline" size={14} color="#DB2777" />
                      <Text style={styles.garageMetaText}>下次保養 {v.nextMaintKm.toLocaleString()} km</Text>
                    </View>
                  </View>
                </BlurView>
              ))}

              <TouchableOpacity activeOpacity={0.8} onPress={() => setAddVehicleModalVisible(true)}>
                <LinearGradient
                  colors={['rgba(251, 207, 232, 0.72)', 'rgba(244, 114, 182, 0.35)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.addVehicleWideBtn}
                >
                  <Ionicons name="add" size={20} color="#9D174D" />
                  <Text style={styles.addVehicleWideText}>新增車輛</Text>
                </LinearGradient>
              </TouchableOpacity>

              <View style={styles.garageToolsGrid}>
                {[
                  {
                    label: '加油紀錄',
                    icon: 'water-outline',
                    color: '#F97316',
                    bg: '#FFEDD5',
                    action: () => {
                      setSelectedVehicleIdx(0);
                      setRefuelModalVisible(true);
                    },
                  },
                  {
                    label: '保養紀錄',
                    icon: 'build-outline',
                    color: '#EC4899',
                    bg: '#FCE7F3',
                    action: () => {
                      setSelectedVehicleIdx(0);
                      setMaintModalVisible(true);
                    },
                  },
                  {
                    label: '油耗統計',
                    icon: 'bar-chart-outline',
                    color: '#8B5CF6',
                    bg: '#EDE9FE',
                    action: () => setStatsModalVisible(true),
                  },
                  {
                    label: '保險提醒',
                    icon: 'shield-outline',
                    color: '#3B82F6',
                    bg: '#DBEAFE',
                    action: () =>
                      Alert.alert(
                        '強制險到期倒數 🛡️',
                        vehicles.map((v) => `• ${v.nickname}：剩餘 ${v.insuranceDays} 天`).join('\n')
                      ),
                  },
                  {
                    label: '驗車提醒',
                    icon: 'checkmark-done-circle-outline',
                    color: '#10B981',
                    bg: '#D1FAE5',
                    action: () =>
                      Alert.alert(
                        '排氣 / 驗車定檢提醒 ✅',
                        '機車出廠滿 5 年須每年定檢排氣；自小客車出廠滿 5 年須定期檢驗。'
                      ),
                  },
                  {
                    label: '稅金提醒',
                    icon: 'wallet-outline',
                    color: '#F59E0B',
                    bg: '#FEF3C7',
                    action: () =>
                      Alert.alert('牌照稅 ＆ 燃料費提醒 💰', '• 4 月：使用牌照稅\n• 7 月：汽車/機車燃料使用費'),
                  },
                ].map((tool) => (
                  <TouchableOpacity
                    key={tool.label}
                    style={styles.garageToolWrapper}
                    activeOpacity={0.78}
                    onPress={tool.action}
                  >
                    <BlurView intensity={60} tint="light" style={styles.garageToolGlass}>
                      <View style={[styles.garageToolIconBox, { backgroundColor: tool.bg }]}>
                        <Ionicons name={tool.icon as any} size={24} color={tool.color} />
                      </View>
                      <Text style={styles.garageToolLabel}>{tool.label}</Text>
                    </BlurView>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* -------------------- TAB 3: 交通地圖（直連 iOS Apple Maps 實景導航） -------------------- */}
          {activeTab === 'map' && (
            <View style={styles.sectionStack}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {[
                  { key: 'gas', label: '⛽ 附近中油加油站' },
                  { key: 'traffic', label: '🚦 即時路況導航' },
                  { key: 'parking', label: '🅿️ 附近停車場' },
                  { key: 'dmv', label: '🏢 監理站導航' },
                ].map((item) => {
                  const active = mapCategory === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      style={[styles.mapFilterPill, active && styles.mapFilterPillActive]}
                      onPress={() => setMapCategory(item.key as MapCategory)}
                    >
                      <Text style={[styles.mapFilterText, active && styles.mapFilterTextActive]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() =>
                  openNativeMapsSearch(
                    mapCategory === 'gas'
                      ? '中油加油站'
                      : mapCategory === 'parking'
                      ? '停車場'
                      : mapCategory === 'dmv'
                      ? '監理站'
                      : '高速公路交流道'
                  )
                }
              >
                <LinearGradient colors={['#E0F2FE', '#FCE7F3', '#F5D0FE']} style={styles.mapPreviewCard}>
                  <Ionicons name="navigate-circle" size={48} color="#DB2777" />
                  <Text style={styles.mapPreviewTitle}>
                    點此開啟 Apple Maps 實景導航
                  </Text>
                  <Text style={styles.mapPreviewSub}>
                    搜尋目標：{city.name}{' '}
                    {mapCategory === 'gas'
                      ? '中油直營加油站'
                      : mapCategory === 'parking'
                      ? '周邊停車場'
                      : mapCategory === 'dmv'
                      ? '監理站所'
                      : '即時路況'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <BlurView intensity={65} tint="light" style={styles.glassCard}>
                <Text style={styles.oilCardTitle}>快速一鍵地圖搜尋</Text>
                <View style={{ marginTop: 10, gap: 10 }}>
                  {[
                    { title: '最近的中油直營加油站', q: '台灣中油加油站', icon: 'flame', color: '#F97316' },
                    { title: '周邊室內 / 平面停車場', q: '停車場', icon: 'car', color: '#2563EB' },
                    { title: '最近的機車行 / 保養廠', q: '機車行', icon: 'build', color: '#EC4899' },
                    { title: '最近的監理站 / 監理所', q: '監理站', icon: 'business', color: '#8B5CF6' },
                  ].map((row, idx) => (
                    <React.Fragment key={row.title}>
                      {idx > 0 && <View style={styles.softDivider} />}
                      <TouchableOpacity
                        style={styles.listRow}
                        onPress={() => openNativeMapsSearch(row.q)}
                      >
                        <Ionicons name={row.icon as any} size={18} color={row.color} />
                        <Text style={[styles.listRowTitle, { marginLeft: 10 }]}>{row.title}</Text>
                        <Text style={[styles.listRowRight, { color: '#DB2777' }]}>開啟地圖 ➔</Text>
                      </TouchableOpacity>
                    </React.Fragment>
                  ))}
                </View>
              </BlurView>
            </View>
          )}

          {/* -------------------- TAB 4: 服務大廳（直連 mmlovenn.com 真實 API） -------------------- */}
          {activeTab === 'services' && (
            <View style={styles.sectionStack}>
              <Text style={styles.sectionTitle}>考照服務（即時 API）</Text>
              <TouchableOpacity activeOpacity={0.82} onPress={openExamRadarModal}>
                <BlurView intensity={68} tint="light" style={styles.serviceBannerCard}>
                  <View style={[styles.serviceLeadIcon, { backgroundColor: '#FCE7F3' }]}>
                    <Ionicons name="id-card" size={26} color="#DB2777" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.serviceCardTitle}>考照報名助手（即時查空位）</Text>
                    <Text style={styles.serviceCardSub}>直連全台 37 站監理所即時剩餘名額</Text>
                  </View>
                  <Image source={require('./assets/icon.png')} style={styles.serviceMascotMini} />
                </BlurView>
              </TouchableOpacity>

              <Text style={styles.sectionTitle}>車牌服務（即時 API）</Text>
              <TouchableOpacity activeOpacity={0.82} onPress={openPlateSearchModal}>
                <BlurView intensity={68} tint="light" style={styles.serviceBannerCard}>
                  <View style={styles.pinkPlateBadgeLarge}>
                    <Text style={styles.pinkPlateTextLarge}>9969</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.serviceCardTitle}>車牌即時搜尋 ＆ 收藏</Text>
                    <Text style={styles.serviceCardSub}>14 大車種全台庫存查詢・一鍵同步網站收藏</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9D174D" />
                </BlurView>
              </TouchableOpacity>

              <Text style={styles.sectionTitle}>交通相關</Text>
              <View style={styles.quickGrid}>
                {[
                  { label: '油價查詢', icon: 'flame', color: '#F97316', bg: '#FFEDD5', onPress: () => setActiveTab('home') },
                  { label: '停車資訊', icon: 'location', color: '#2563EB', bg: '#DBEAFE', onPress: () => openNativeMapsSearch('停車場') },
                  { label: '即時路況', icon: 'car', color: '#EC4899', bg: '#FCE7F3', onPress: () => openNativeMapsSearch('國道即時路況') },
                  { label: '公路局標牌', icon: 'hammer', color: '#EA580C', bg: '#FFEDD5', onPress: () => Linking.openURL('https://plate.mmlovenn.com') },
                ].map((item) => (
                  <TouchableOpacity key={item.label} style={styles.quickTileWrapper} onPress={item.onPress}>
                    <BlurView intensity={58} tint="light" style={styles.quickTileGlass}>
                      <View style={[styles.quickIconBox, { backgroundColor: item.bg }]}>
                        <Ionicons name={item.icon as any} size={22} color={item.color} />
                      </View>
                      <Text style={styles.quickTileLabel}>{item.label}</Text>
                    </BlurView>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.sectionTitle}>生活工具</Text>
              <View style={styles.quickGrid}>
                {[
                  { label: '天氣資訊', icon: 'partly-sunny', color: '#0EA5E9', bg: '#E0F2FE', onPress: () => setActiveTab('home') },
                  {
                    label: '空氣品質',
                    icon: 'cloud-outline',
                    color: '#84CC16',
                    bg: '#ECFCCB',
                    onPress: () =>
                      Alert.alert(
                        `${city.name} 即時空氣品質`,
                        `US AQI：${aqi?.usAqi ?? '--'}（${aqi?.label ?? '讀取中'}）\nPM2.5：${aqi?.pm25 ?? '--'} μg/m³`
                      ),
                  },
                  { label: '附近景點', icon: 'trail-sign', color: '#14B8A6', bg: '#CCFBF1', onPress: () => openNativeMapsSearch('熱門景點') },
                  { label: '官網主站', icon: 'globe-outline', color: '#EC4899', bg: '#FCE7F3', onPress: () => Linking.openURL('https://mmlovenn.com') },
                ].map((item) => (
                  <TouchableOpacity key={item.label} style={styles.quickTileWrapper} onPress={item.onPress}>
                    <BlurView intensity={58} tint="light" style={styles.quickTileGlass}>
                      <View style={[styles.quickIconBox, { backgroundColor: item.bg }]}>
                        <Ionicons name={item.icon as any} size={22} color={item.color} />
                      </View>
                      <Text style={styles.quickTileLabel}>{item.label}</Text>
                    </BlurView>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* -------------------- TAB 5: 我的（真實 Google 一鍵登入 + 網站帳號互通） -------------------- */}
          {activeTab === 'profile' && (
            <View style={styles.sectionStack}>
              {user ? (
                <>
                  <BlurView intensity={72} tint="light" style={styles.glassCard}>
                    <View style={styles.profileTopRow}>
                      <Image
                        source={
                          user.picture || user.avatar
                            ? { uri: user.picture || user.avatar }
                            : require('./assets/icon.png')
                        }
                        style={styles.profileAvatar}
                      />
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={styles.profileName}>{user.name}</Text>
                          <View style={user.role === 'admin' || user.is_admin ? styles.adminBadge : styles.vipBadge}>
                            <Text style={user.role === 'admin' || user.is_admin ? styles.adminBadgeText : styles.vipBadgeText}>
                              {user.role === 'admin' || user.is_admin ? '管理員' : user.role.toUpperCase()}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.profileEmail}>{user.email}</Text>
                        <Text style={styles.syncStatusText}>🟢 已與 mmlovenn.com 真實帳號同步</Text>
                      </View>
                    </View>

                    <View style={styles.quotaRow}>
                      <View style={styles.quotaCol}>
                        <Text style={styles.quotaVal}>{user.task_quota ?? 2}</Text>
                        <Text style={styles.quotaLbl}>監控配額</Text>
                      </View>
                      <View style={styles.oilColDivider} />
                      <View style={styles.quotaCol}>
                        <Text style={[styles.quotaVal, { color: '#059669' }]}>{userTasks.length}</Text>
                        <Text style={styles.quotaLbl}>進行中任務</Text>
                      </View>
                      <View style={styles.oilColDivider} />
                      <View style={styles.quotaCol}>
                        <Text style={[styles.quotaVal, { color: '#DB2777' }]}>{userFavorites.length}</Text>
                        <Text style={styles.quotaLbl}>收藏車牌</Text>
                      </View>
                    </View>

                    <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                      <Text style={styles.logoutBtnText}>登出此帳號</Text>
                    </TouchableOpacity>
                  </BlurView>

                  {/* 同步自網站的收藏車牌 */}
                  {userFavorites.length > 0 && (
                    <BlurView intensity={65} tint="light" style={styles.glassCard}>
                      <Text style={styles.oilCardTitle}>❤️ 網站同步收藏車牌 ({userFavorites.length})</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                        {userFavorites.slice(0, 12).map((fav: any, i: number) => (
                          <View key={i} style={styles.pinkPlateBadge}>
                            <Text style={styles.pinkPlateText}>
                              {fav.plate_number || fav.plate || String(fav)}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </BlurView>
                  )}
                </>
              ) : (
                <BlurView intensity={72} tint="light" style={styles.loginGlassCard}>
                  <Image source={require('./assets/icon.png')} style={styles.loginLogo} />
                  <Text style={styles.loginTitle}>登入 鍋巴 GOBA</Text>
                  <Text style={styles.loginSubtitle}>
                    使用與網站 mmlovenn.com 相同的 Google 帳號一鍵登入，立即同步車牌收藏、監控任務與 VIP 權限！
                  </Text>

                  <TouchableOpacity
                    style={styles.googleBtn}
                    onPress={handleGoogleLogin}
                    disabled={isLoadingAuth}
                  >
                    {isLoadingAuth ? (
                      <ActivityIndicator color="#1F2937" />
                    ) : (
                      <>
                        <Ionicons name="logo-google" size={18} color="#EA4335" style={{ marginRight: 10 }} />
                        <Text style={styles.googleBtnText}>以 Google 帳號一鍵登入</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </BlurView>
              )}

              {/* 設定清單 */}
              <BlurView intensity={65} tint="light" style={styles.glassCard}>
                <Text style={styles.oilCardTitle}>帳號與系統設定</Text>
                <TouchableOpacity
                  style={styles.settingItem}
                  onPress={() => Linking.openURL('https://plate.mmlovenn.com')}
                >
                  <View style={styles.settingLeft}>
                    <Ionicons name="globe-outline" size={18} color="#2563EB" />
                    <Text style={styles.settingText}>開啟車牌尋找助手網頁版</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                </TouchableOpacity>
                <View style={styles.softDivider} />
                <TouchableOpacity
                  style={styles.settingItem}
                  onPress={() => Linking.openURL('https://exam.mmlovenn.com')}
                >
                  <View style={styles.settingLeft}>
                    <Ionicons name="id-card-outline" size={18} color="#059669" />
                    <Text style={styles.settingText}>開啟考照報名助手網頁版</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                </TouchableOpacity>
                <View style={styles.softDivider} />
                <TouchableOpacity
                  style={styles.settingItem}
                  onPress={() =>
                    Alert.alert(
                      '關於 鍋巴 GOBA',
                      '鍋巴 GOBA v2.1 (Live Data + Liquid Glass)\n即時氣象：Open-Meteo\n即時油價：台灣中油官方\n車牌 ＆ 考照 ＆ 會員：mmlovenn.com'
                    )
                  }
                >
                  <View style={styles.settingLeft}>
                    <Ionicons name="sparkles-outline" size={18} color="#8B5CF6" />
                    <Text style={styles.settingText}>關於 鍋巴 GOBA</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>v2.1 Live</Text>
                </TouchableOpacity>
              </BlurView>
            </View>
          )}
        </ScrollView>

        {/* ==================== 浮空 Apple Liquid Glass 底部導覽列 ==================== */}
        <View style={styles.liquidTabOuter}>
          <BlurView intensity={80} tint="light" style={styles.liquidTabBlur}>
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
          </BlurView>
        </View>

        {/* ==================== 內建真實「車牌即時查詢」Modal ==================== */}
        <Modal visible={plateModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <BlurView intensity={95} tint="light" style={[styles.modalGlassSheet, { maxHeight: '85%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>🚙 全台車牌即時查詢</Text>
                <TouchableOpacity onPress={() => setPlateModalVisible(false)}>
                  <Ionicons name="close-circle" size={26} color="#9D174D" />
                </TouchableOpacity>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 8 }}>
                {PLATE_CAR_TYPES.map((ct) => (
                  <TouchableOpacity
                    key={ct}
                    style={[styles.chipBtn, plateCarType === ct && styles.chipBtnActive]}
                    onPress={() => {
                      setPlateCarType(ct);
                      runPlateSearch(plateQuery, ct);
                    }}
                  >
                    <Text style={[styles.chipText, plateCarType === ct && styles.chipTextActive]}>{ct}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <View style={styles.searchRow}>
                <TextInput
                  style={[styles.textInput, { flex: 1, marginRight: 8 }]}
                  placeholder="輸入心儀號碼（如 9969、8888）"
                  autoCapitalize="characters"
                  value={plateQuery}
                  onChangeText={setPlateQuery}
                  onSubmitEditing={() => runPlateSearch()}
                />
                <TouchableOpacity style={styles.searchGoBtn} onPress={() => runPlateSearch()}>
                  <Text style={{ color: '#FFF', fontWeight: '800', fontSize: 13 }}>查詢</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.resultMeta}>
                共找到 {plateTotal} 筆在庫車牌 {plateUpdatedTime ? `• 更新 ${plateUpdatedTime}` : ''}
              </Text>

              {plateLoading ? (
                <ActivityIndicator size="large" color="#EC4899" style={{ marginVertical: 28 }} />
              ) : (
                <ScrollView style={{ maxHeight: 340 }} showsVerticalScrollIndicator={false}>
                  {plateResults.length === 0 ? (
                    <Text style={styles.emptyText}>目前無符合「{plateQuery}」的在庫號牌，換個號碼試試！</Text>
                  ) : (
                    plateResults.map((p, idx) => (
                      <View key={`${p.plate_number}-${idx}`} style={styles.plateResultRow}>
                        <View>
                          <View style={styles.pinkPlateBadge}>
                            <Text style={styles.pinkPlateText}>{p.plate_number}</Text>
                          </View>
                          <Text style={styles.plateOfficeText}>{p.motor_vehicles_office}</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.favSmallBtn}
                          onPress={() => handleFavoritePlate(p)}
                        >
                          <Ionicons name="heart-outline" size={16} color="#DB2777" />
                          <Text style={styles.favSmallText}>收藏</Text>
                        </TouchableOpacity>
                      </View>
                    ))
                  )}
                </ScrollView>
              )}
            </BlurView>
          </View>
        </Modal>

        {/* ==================== 內建真實「考照名額雷達」Modal ==================== */}
        <Modal visible={examModalVisible} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <BlurView intensity={95} tint="light" style={[styles.modalGlassSheet, { maxHeight: '85%' }]}>
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
                <ScrollView style={{ maxHeight: 330 }} showsVerticalScrollIndicator={false}>
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
          </View>
        </Modal>

        {/* ==================== 加油記帳 Modal ==================== */}
        <Modal visible={refuelModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <BlurView intensity={92} tint="light" style={styles.modalGlassSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>⛽ 新增加油紀錄</Text>
                <TouchableOpacity onPress={() => setRefuelModalVisible(false)}>
                  <Ionicons name="close-circle" size={26} color="#9D174D" />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalSub}>
                車輛：{vehicles[selectedVehicleIdx]?.nickname || vehicles[0]?.nickname}
              </Text>

              <Text style={styles.inputLabel}>加油公升數 (L)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="decimal-pad"
                placeholder="例如：6.2"
                value={refuelLiters}
                onChangeText={setRefuelLiters}
              />

              <Text style={styles.inputLabel}>總金額 (NT$)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                placeholder="例如：200"
                value={refuelAmount}
                onChangeText={setRefuelAmount}
              />

              <Text style={styles.inputLabel}>當前儀表總里程 (km)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                placeholder={`前次里程：${vehicles[selectedVehicleIdx]?.mileage || 0}`}
                value={refuelKm}
                onChangeText={setRefuelKm}
              />

              <TouchableOpacity style={styles.primaryPinkBtn} onPress={handleAddRefuel}>
                <Text style={styles.primaryPinkBtnText}>儲存並計算實測油耗</Text>
              </TouchableOpacity>
            </BlurView>
          </View>
        </Modal>

        {/* ==================== 保養紀錄 Modal ==================== */}
        <Modal visible={maintModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <BlurView intensity={92} tint="light" style={styles.modalGlassSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>🔧 新增保養紀錄</Text>
                <TouchableOpacity onPress={() => setMaintModalVisible(false)}>
                  <Ionicons name="close-circle" size={26} color="#9D174D" />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalSub}>
                車輛：{vehicles[selectedVehicleIdx]?.nickname || vehicles[0]?.nickname}
              </Text>

              <Text style={styles.inputLabel}>保養項目</Text>
              <TextInput
                style={styles.textInput}
                placeholder="例如：更換機油 + 齒輪油"
                value={maintItem}
                onChangeText={setMaintItem}
              />

              <Text style={styles.inputLabel}>花費金額 (NT$)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                placeholder="例如：450"
                value={maintCost}
                onChangeText={setMaintCost}
              />

              <Text style={styles.inputLabel}>保養當下里程 (km)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                placeholder={`目前里程：${vehicles[selectedVehicleIdx]?.mileage || 0}`}
                value={maintKm}
                onChangeText={setMaintKm}
              />

              <TouchableOpacity style={styles.primaryPinkBtn} onPress={handleAddMaint}>
                <Text style={styles.primaryPinkBtnText}>儲存並更新下次保養里程</Text>
              </TouchableOpacity>
            </BlurView>
          </View>
        </Modal>

        {/* ==================== 油耗與養車統計 Modal ==================== */}
        <Modal visible={statsModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <BlurView intensity={92} tint="light" style={[styles.modalGlassSheet, { maxHeight: '75%' }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>📊 油耗與歷史明細</Text>
                <TouchableOpacity onPress={() => setStatsModalVisible(false)}>
                  <Ionicons name="close-circle" size={26} color="#9D174D" />
                </TouchableOpacity>
              </View>

              <View style={styles.quotaRow}>
                <View style={styles.quotaCol}>
                  <Text style={styles.quotaVal}>${totalFuelSpent}</Text>
                  <Text style={styles.quotaLbl}>累積油資</Text>
                </View>
                <View style={styles.oilColDivider} />
                <View style={styles.quotaCol}>
                  <Text style={[styles.quotaVal, { color: '#DB2777' }]}>
                    {totalFuelLiters.toFixed(1)} L
                  </Text>
                  <Text style={styles.quotaLbl}>累積加油</Text>
                </View>
                <View style={styles.oilColDivider} />
                <View style={styles.quotaCol}>
                  <Text style={[styles.quotaVal, { color: '#059669' }]}>{maintLogs.length} 次</Text>
                  <Text style={styles.quotaLbl}>保養紀錄</Text>
                </View>
              </View>

              <ScrollView style={{ marginTop: 14, maxHeight: 260 }}>
                {refuelLogs.length === 0 ? (
                  <Text style={styles.emptyText}>尚未有加油紀錄，點擊「加油紀錄」記下第一筆吧！</Text>
                ) : (
                  refuelLogs.map((log) => (
                    <View key={log.id} style={styles.plateResultRow}>
                      <View>
                        <Text style={styles.examStationTitle}>{log.vehicleName}</Text>
                        <Text style={styles.plateOfficeText}>
                          {log.date} • {log.liters}L • 里程 {log.odometer} km
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ fontWeight: '900', color: '#BE185D' }}>NT$ {log.amount}</Text>
                        {log.kmPerLiter ? (
                          <Text style={{ fontSize: 11, color: '#059669', fontWeight: '700' }}>
                            {log.kmPerLiter} km/L
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>
            </BlurView>
          </View>
        </Modal>

        {/* ==================== 新增車輛 Modal ==================== */}
        <Modal visible={addVehicleModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <BlurView intensity={92} tint="light" style={styles.modalGlassSheet}>
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

              <Text style={styles.inputLabel}>愛車名稱 / 型號</Text>
              <TextInput
                style={styles.textInput}
                placeholder="例如：MMBCU 158 或 Honda Civic"
                value={newVehicleName}
                onChangeText={setNewVehicleName}
              />

              <Text style={styles.inputLabel}>車牌號碼</Text>
              <TextInput
                style={styles.textInput}
                placeholder="例如：9969 或 PHP-9969"
                autoCapitalize="characters"
                value={newVehiclePlate}
                onChangeText={setNewVehiclePlate}
              />

              <Text style={styles.inputLabel}>目前里程數 (km)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                placeholder="例如：5200"
                value={newVehicleKm}
                onChangeText={setNewVehicleKm}
              />

              <TouchableOpacity style={styles.primaryPinkBtn} onPress={handleAddVehicle}>
                <Text style={styles.primaryPinkBtnText}>確認加入我的車庫</Text>
              </TouchableOpacity>
            </BlurView>
          </View>
        </Modal>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  rootGradient: { flex: 1 },
  ambientOrbTopRight: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(244, 114, 182, 0.22)',
  },
  ambientOrbBottomLeft: {
    position: 'absolute',
    bottom: 40,
    left: -70,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: 'rgba(192, 132, 252, 0.16)',
  },
  safeArea: { flex: 1 },
  homeTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  brandRow: { flexDirection: 'row', alignItems: 'center' },
  topMascotLogo: {
    width: 34,
    height: 34,
    borderRadius: 12,
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  homeBrandTitle: { fontSize: 20, fontWeight: '900', color: '#5B2333', letterSpacing: 0.4 },
  iconCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  redDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#EC4899',
  },
  centeredTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  centeredTitle: { fontSize: 19, fontWeight: '900', color: '#5B2333' },
  addCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#F472B6',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 118 },
  sectionStack: { gap: 14 },
  heroBanner: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 18,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.85)',
    shadowColor: '#EC4899',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
  },
  heroPetalDecor1: {
    position: 'absolute',
    top: -18,
    right: -14,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  heroPetalDecor2: {
    position: 'absolute',
    bottom: -24,
    left: 60,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(244, 114, 182, 0.18)',
  },
  heroMascotWrap: {
    width: 78,
    height: 78,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    padding: 4,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  heroMascotImg: { width: '100%', height: '100%', borderRadius: 18 },
  heroTextCol: { flex: 1, marginLeft: 14 },
  heroTitle: { fontSize: 23, fontWeight: '900', color: '#6B1D3A', letterSpacing: 0.5 },
  heroSubtitlePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
  },
  heroSubtitle: { fontSize: 12, fontWeight: '700', color: '#9D174D' },
  heroUserGreeting: { fontSize: 11, fontWeight: '700', color: '#BE185D', marginTop: 6 },
  quickGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  quickTileWrapper: {
    width: '23.4%',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  quickTileGlass: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
  },
  quickIconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  quickTileLabel: { fontSize: 11, fontWeight: '700', color: '#5B2333' },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  sectionTitle: { fontSize: 16, fontWeight: '900', color: '#5B2333' },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  refreshText: { fontSize: 11, fontWeight: '600', color: '#9D174D' },
  glassCard: {
    borderRadius: 22,
    padding: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.92)',
  },
  weatherRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  weatherLeft: { flexDirection: 'row', alignItems: 'center' },
  weatherIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 20,
    backgroundColor: 'rgba(254, 243, 199, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  weatherLocation: { fontSize: 12, fontWeight: '700', color: '#9D174D' },
  weatherTemp: { fontSize: 28, fontWeight: '900', color: '#3B1525', lineHeight: 34 },
  weatherDesc: { fontSize: 11, fontWeight: '600', color: '#7C6270' },
  weatherRight: { alignItems: 'flex-end', gap: 5 },
  weatherHiLo: { fontSize: 13 },
  rainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(224, 242, 254, 0.75)',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 10,
  },
  rainText: { fontSize: 11, fontWeight: '700', color: '#1E40AF' },
  oilHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  oilCardTitle: { fontSize: 15, fontWeight: '800', color: '#5B2333' },
  oilUnit: { fontSize: 11, color: '#9D174D', fontWeight: '600' },
  oilColumnsRow: { flexDirection: 'row', alignItems: 'center' },
  oilCol: { flex: 1, alignItems: 'center' },
  oilColDivider: { width: 1, height: 28, backgroundColor: 'rgba(244, 114, 182, 0.22)' },
  oilColLabel: { fontSize: 11, color: '#7C6270', marginBottom: 4 },
  oilColPrice: { fontSize: 18, fontWeight: '900', color: '#3B1525' },
  oilTrendBanner: {
    marginTop: 12,
    backgroundColor: 'rgba(254, 243, 199, 0.72)',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
  oilTrendText: { fontSize: 11, fontWeight: '700', color: '#92400E' },
  segmentedBar: {
    flexDirection: 'row',
    borderRadius: 22,
    padding: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: 18, alignItems: 'center' },
  segmentBtnActive: {
    backgroundColor: 'rgba(244, 114, 182, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(244, 114, 182, 0.45)',
  },
  segmentText: { fontSize: 13, fontWeight: '700', color: '#7C6270' },
  segmentTextActive: { color: '#9D174D', fontWeight: '900' },
  garageVehicleCard: {
    borderRadius: 22,
    padding: 15,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
  },
  garageTopRow: { flexDirection: 'row', alignItems: 'center' },
  vehicleThumbBox: { width: 68, height: 60, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  vehicleTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  vehicleName: { fontSize: 16, fontWeight: '900', color: '#3B1525' },
  pinkPlateBadge: {
    alignSelf: 'flex-start',
    marginTop: 5,
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#FFF0F6',
    borderWidth: 1.5,
    borderColor: '#F472B6',
  },
  pinkPlateText: { fontSize: 13, fontWeight: '900', color: '#BE185D', letterSpacing: 1.2 },
  garageMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(244, 114, 182, 0.16)',
  },
  garageMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  garageMetaText: { fontSize: 12, fontWeight: '600', color: '#6B4C5A' },
  addVehicleWideBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  addVehicleWideText: { fontSize: 14, fontWeight: '800', color: '#9D174D' },
  garageToolsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 10 },
  garageToolWrapper: {
    width: '31.5%',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.3,
    borderColor: 'rgba(255, 255, 255, 0.92)',
  },
  garageToolGlass: { paddingVertical: 16, alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.62)' },
  garageToolIconBox: {
    width: 44,
    height: 44,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  garageToolLabel: { fontSize: 12, fontWeight: '800', color: '#5B2333' },
  mapFilterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.92)',
  },
  mapFilterPillActive: { backgroundColor: '#EC4899', borderColor: '#EC4899' },
  mapFilterText: { fontSize: 12, fontWeight: '700', color: '#7C6270' },
  mapFilterTextActive: { color: '#FFFFFF' },
  mapPreviewCard: {
    borderRadius: 24,
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  mapPreviewTitle: { fontSize: 16, fontWeight: '900', color: '#5B2333', marginTop: 10 },
  mapPreviewSub: { fontSize: 12, color: '#9D174D', marginTop: 4, fontWeight: '600' },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  listRowTitle: { flex: 1, fontSize: 13, fontWeight: '700', color: '#3B1525' },
  listRowRight: { fontSize: 12, fontWeight: '800' },
  softDivider: { height: 1, backgroundColor: 'rgba(244, 114, 182, 0.16)', marginVertical: 5 },
  serviceBannerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 22,
    padding: 15,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.94)',
  },
  serviceLeadIcon: { width: 48, height: 48, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  serviceCardTitle: { fontSize: 15, fontWeight: '900', color: '#3B1525' },
  serviceCardSub: { fontSize: 11, color: '#7C6270', marginTop: 3, fontWeight: '500' },
  serviceMascotMini: { width: 48, height: 48, borderRadius: 16, marginLeft: 8 },
  pinkPlateBadgeLarge: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFF0F6',
    borderWidth: 1.8,
    borderColor: '#F472B6',
  },
  pinkPlateTextLarge: { fontSize: 13, fontWeight: '900', color: '#BE185D', letterSpacing: 1 },
  loginGlassCard: {
    borderRadius: 26,
    padding: 24,
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
  },
  loginLogo: { width: 68, height: 68, borderRadius: 22, borderWidth: 2, borderColor: '#F472B6', marginBottom: 12 },
  loginTitle: { fontSize: 20, fontWeight: '900', color: '#5B2333' },
  loginSubtitle: { fontSize: 12, color: '#7C6270', textAlign: 'center', lineHeight: 18, marginTop: 6, marginBottom: 20 },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: '#F3D1E2',
  },
  googleBtnText: { fontSize: 14, fontWeight: '800', color: '#3B1525' },
  profileTopRow: { flexDirection: 'row', alignItems: 'center' },
  profileAvatar: { width: 56, height: 56, borderRadius: 18, borderWidth: 2, borderColor: '#EC4899' },
  profileName: { fontSize: 17, fontWeight: '900', color: '#3B1525' },
  profileEmail: { fontSize: 12, color: '#7C6270', marginTop: 2 },
  syncStatusText: { fontSize: 11, fontWeight: '700', color: '#059669', marginTop: 4 },
  adminBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: 8 },
  adminBadgeText: { fontSize: 10, fontWeight: '800', color: '#DC2626' },
  vipBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginLeft: 8 },
  vipBadgeText: { fontSize: 10, fontWeight: '800', color: '#D97706' },
  quotaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 245, 249, 0.78)',
    borderRadius: 16,
    paddingVertical: 12,
    marginTop: 14,
  },
  quotaCol: { flex: 1, alignItems: 'center' },
  quotaVal: { fontSize: 16, fontWeight: '900', color: '#3B1525' },
  quotaLbl: { fontSize: 10, color: '#7C6270', marginTop: 2 },
  logoutBtn: {
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(254, 226, 226, 0.72)',
    alignItems: 'center',
  },
  logoutBtnText: { fontSize: 12, fontWeight: '800', color: '#DC2626' },
  settingItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11 },
  settingLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  settingText: { fontSize: 13, fontWeight: '700', color: '#3B1525' },
  liquidTabOuter: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 22 : 14,
    left: 14,
    right: 14,
    borderRadius: 34,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.92)',
    shadowColor: '#BE185D',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
  },
  liquidTabBlur: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 6,
    backgroundColor: 'rgba(255, 240, 246, 0.58)',
  },
  liquidTabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 7, borderRadius: 28 },
  liquidTabItemActive: {
    backgroundColor: 'rgba(244, 114, 182, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.85)',
  },
  liquidTabLabel: { fontSize: 10, fontWeight: '700', color: '#7C6270', marginTop: 2 },
  liquidTabLabelActive: { color: '#DB2777', fontWeight: '900' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalGlassSheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 22,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 245, 249, 0.95)',
    borderTopWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: '#5B2333' },
  modalSub: { fontSize: 12, color: '#9D174D', marginBottom: 12, fontWeight: '600' },
  chipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1,
    borderColor: '#F3D1E2',
    marginRight: 8,
  },
  chipBtnActive: { backgroundColor: '#EC4899', borderColor: '#EC4899' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#7C6270' },
  chipTextActive: { color: '#FFFFFF' },
  searchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  searchGoBtn: {
    backgroundColor: '#EC4899',
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
  },
  resultMeta: { fontSize: 11, color: '#9D174D', fontWeight: '600', marginVertical: 10 },
  emptyText: { textAlign: 'center', color: '#9CA3AF', paddingVertical: 24, fontSize: 13 },
  plateResultRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(244, 114, 182, 0.14)',
  },
  plateOfficeText: { fontSize: 11, color: '#7C6270', marginTop: 3 },
  examStationTitle: { fontSize: 14, fontWeight: '800', color: '#3B1525' },
  favSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF0F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F9A8D4',
  },
  favSmallText: { fontSize: 11, fontWeight: '800', color: '#DB2777' },
  quotaGreenBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  quotaGreenText: { fontSize: 12, fontWeight: '900', color: '#047857' },
  categorySwitchRow: { flexDirection: 'row', gap: 10, marginVertical: 10 },
  catBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3D1E2',
  },
  catBtnActive: { backgroundColor: '#EC4899', borderColor: '#EC4899' },
  catBtnText: { fontSize: 13, fontWeight: '700', color: '#7C6270' },
  catBtnTextActive: { color: '#FFFFFF' },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#5B2333', marginTop: 10, marginBottom: 5 },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: '#3B1525',
    borderWidth: 1,
    borderColor: '#F3D1E2',
  },
  primaryPinkBtn: {
    backgroundColor: '#EC4899',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: '#EC4899',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  primaryPinkBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
