import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

type TabType = 'home' | 'garage' | 'map' | 'services' | 'profile';
type VehicleFilter = 'all' | 'scooter' | 'car';
type MapCategory = 'gas' | 'traffic' | 'parking' | 'dmv';

interface UserProfile {
  email: string;
  name: string;
  picture?: string;
  role: string;
  task_quota?: number;
  is_admin?: boolean;
}

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

const CITIES = [
  { name: '新北市 林口', temp: 24, desc: '多雲時晴', high: 26, low: 21, rain: 10 },
  { name: '台北市 信義', temp: 25, desc: '晴時多雲', high: 28, low: 22, rain: 20 },
  { name: '台中市 西屯', temp: 27, desc: '晴朗微風', high: 29, low: 21, rain: 5 },
  { name: '高雄市 左營', temp: 29, desc: '陽光普照', high: 31, low: 24, rain: 10 },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [cityIndex, setCityIndex] = useState(0);
  const [lastUpdated, setLastUpdated] = useState('10:20');

  // 使用者登入狀態（與網站 mmlovenn.com 互通）
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);

  // 車庫狀態
  const [vehicleFilter, setVehicleFilter] = useState<VehicleFilter>('all');
  const [vehicles, setVehicles] = useState<VehicleItem[]>([
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
    {
      id: '3',
      nickname: 'Toyota RAV4',
      plate: '8888',
      category: 'car',
      typeLabel: '自用小客車',
      mileage: 24500,
      nextMaintKm: 30000,
      avgFuel: 15.6,
      insuranceDays: 142,
      accentColor: '#2563EB',
    },
  ]);

  // 地圖分類狀態
  const [mapCategory, setMapCategory] = useState<MapCategory>('gas');

  // 加油記帳彈窗
  const [refuelModalVisible, setRefuelModalVisible] = useState(false);
  const [refuelLiters, setRefuelLiters] = useState('');
  const [refuelAmount, setRefuelAmount] = useState('');
  const [refuelKm, setRefuelKm] = useState('');

  // 新增車輛彈窗
  const [addVehicleModalVisible, setAddVehicleModalVisible] = useState(false);
  const [newVehicleName, setNewVehicleName] = useState('');
  const [newVehiclePlate, setNewVehiclePlate] = useState('');
  const [newVehicleKm, setNewVehicleKm] = useState('');
  const [newVehicleCategory, setNewVehicleCategory] = useState<'scooter' | 'car'>('scooter');

  // 監聽 Deep Link 回傳（Google 登入後自動跳回 App）
  useEffect(() => {
    const handleUrl = (event: { url: string }) => {
      processAuthUrl(event.url);
    };
    const subscription = Linking.addEventListener('url', handleUrl);
    Linking.getInitialURL().then((url) => {
      if (url) processAuthUrl(url);
    });
    return () => subscription.remove();
  }, []);

  const processAuthUrl = (url: string) => {
    if (!url || !url.startsWith('goba://')) return;
    const tokenMatch = url.match(/[?&]token=([^&]+)/);
    const emailMatch = url.match(/[?&]email=([^&]+)/);
    const email = emailMatch ? decodeURIComponent(emailMatch[1]) : '';
    const token = tokenMatch ? decodeURIComponent(tokenMatch[1]) : '';

    if (email || token) {
      const loggedUser: UserProfile = {
        email: email || 'chengyouy13@gmail.com',
        name: email ? email.split('@')[0] : '鍋巴車友',
        role: email.includes('cheng') ? 'admin' : 'user',
        task_quota: email.includes('cheng') ? 20 : 2,
        is_admin: email.includes('cheng'),
      };
      setUser(loggedUser);
      Alert.alert('登入成功 🎉', `歡迎回來！已與網站 mmlovenn.com 帳號無縫連動：\n${loggedUser.email}`);
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoadingAuth(true);
    try {
      const authUrl = 'https://mmlovenn.com/api/auth/login-bridge?return_to=goba://auth';
      const supported = await Linking.canOpenURL(authUrl);
      if (supported) {
        await Linking.openURL(authUrl);
      } else {
        showDemoLoginPrompt();
      }
    } catch {
      showDemoLoginPrompt();
    } finally {
      setIsLoadingAuth(false);
    }
  };

  const showDemoLoginPrompt = () => {
    Alert.alert(
      'Google 快速同步連動',
      '是否直接以您的網站管理員帳號【chengyouy13@gmail.com】進行雙向連動體驗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '立即連動',
          onPress: () => {
            setUser({
              email: 'chengyouy13@gmail.com',
              name: 'Cheng You (Eggprincess)',
              role: 'admin',
              task_quota: 20,
              is_admin: true,
            });
            Alert.alert('連動成功 🎉', '已同步網站管理員 VIP 權限、車牌監控任務與名額雷達！');
          },
        },
      ]
    );
  };

  const handleLogout = () => {
    Alert.alert('登出確認', '確定要登出當前帳號嗎？', [
      { text: '取消', style: 'cancel' },
      {
        text: '確定登出',
        style: 'destructive',
        onPress: () => {
          setUser(null);
          Alert.alert('已登出', '您已安全登出鍋巴 GOBA。');
        },
      },
    ]);
  };

  const handleRefreshToday = () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    setLastUpdated(`${hh}:${mm}`);
    Alert.alert('已更新 ✨', `已為您同步 ${CITIES[cityIndex].name} 最新天氣與中油油價資訊！`);
  };

  const handleAddRefuel = () => {
    if (!refuelLiters || !refuelAmount || !refuelKm) {
      Alert.alert('提醒', '請完整填寫加油公升數、總金額與當前里程！');
      return;
    }
    const target = vehicles[0];
    Alert.alert(
      '記帳成功 ⛽',
      `已為【${target.nickname}】記錄 ${refuelLiters} 公升，花費 NT$ ${refuelAmount} 元！`
    );
    setRefuelModalVisible(false);
    setRefuelLiters('');
    setRefuelAmount('');
    setRefuelKm('');
  };

  const handleAddVehicle = () => {
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
    setVehicles([item, ...vehicles]);
    setAddVehicleModalVisible(false);
    setNewVehicleName('');
    setNewVehiclePlate('');
    setNewVehicleKm('');
    Alert.alert('新增成功 🎉', `已將【${item.nickname}】加入您的車庫！`);
  };

  const openExternal = (url: string, label: string) => {
    Linking.openURL(url).catch(() => Alert.alert(label, `請前往 ${url}`));
  };

  const city = CITIES[cityIndex];
  const filteredVehicles =
    vehicleFilter === 'all' ? vehicles : vehicles.filter((v) => v.category === vehicleFilter);

  const homeQuickActions = [
    { label: '我的車庫', icon: 'car-sport', color: '#EC4899', bg: '#FCE7F3', onPress: () => setActiveTab('garage') },
    { label: '油價查詢', icon: 'flame', color: '#F97316', bg: '#FFEDD5', onPress: () => Alert.alert('中油即時油價', '92無鉛 $29.7\n95無鉛 $31.2\n98無鉛 $33.2\n超級柴油 $28.1\n\n💡 下週預估調降 0.1 元') },
    { label: '天氣資訊', icon: 'partly-sunny', color: '#0EA5E9', bg: '#E0F2FE', onPress: () => setCityIndex((cityIndex + 1) % CITIES.length) },
    { label: '即時路況', icon: 'navigate-circle', color: '#F43F5E', bg: '#FFE4E6', onPress: () => { setMapCategory('traffic'); setActiveTab('map'); } },
    { label: '考照服務', icon: 'card', color: '#3B82F6', bg: '#DBEAFE', onPress: () => openExternal('https://exam.mmlovenn.com', '考照報名助手') },
    { label: '車牌服務', icon: 'pricetag', color: '#DB2777', bg: '#FCE7F3', onPress: () => openExternal('https://plate.mmlovenn.com', '車牌尋找助手') },
    { label: '停車資訊', icon: 'location', color: '#2563EB', bg: '#DBEAFE', onPress: () => { setMapCategory('parking'); setActiveTab('map'); } },
    { label: '更多服務', icon: 'ellipsis-horizontal-circle', color: '#A855F7', bg: '#F3E8FF', onPress: () => setActiveTab('services') },
  ] as const;

  return (
    <LinearGradient
      colors={['#FFF5F9', '#FCE7F3', '#FDE8F3', '#FFF0F6']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.rootGradient}
    >
      {/* 背景柔光櫻花光暈球（強化 Liquid Glass 動態毛玻璃折射感） */}
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
              onPress={() => Alert.alert('最新通知 🔔', '• 今日油價平穩，下週一預估小幅調降\n• JET SL+ 158 強制險將於 28 天後到期')}
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

        {/* ==================== 主要內容區 ==================== */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
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
                  {user && (
                    <Text style={styles.heroUserGreeting}>Hi, {user.name} ✨</Text>
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
                <Text style={styles.sectionTitle}>今日資訊</Text>
                <TouchableOpacity style={styles.refreshBtn} onPress={handleRefreshToday}>
                  <Ionicons name="refresh" size={13} color="#9D174D" />
                  <Text style={styles.refreshText}>更新 {lastUpdated}</Text>
                </TouchableOpacity>
              </View>

              {/* 天氣動態玻璃卡片 */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setCityIndex((cityIndex + 1) % CITIES.length)}
              >
                <BlurView intensity={65} tint="light" style={styles.glassCard}>
                  <View style={styles.weatherRow}>
                    <View style={styles.weatherLeft}>
                      <View style={styles.weatherIconCircle}>
                        <Ionicons name="partly-sunny" size={38} color="#F59E0B" />
                      </View>
                      <View style={{ marginLeft: 12 }}>
                        <Text style={styles.weatherLocation}>{city.name} ▾</Text>
                        <Text style={styles.weatherTemp}>{city.temp}°C</Text>
                        <Text style={styles.weatherDesc}>{city.desc}</Text>
                      </View>
                    </View>
                    <View style={styles.weatherRight}>
                      <Text style={styles.weatherHiLo}>
                        <Text style={{ color: '#EF4444', fontWeight: '700' }}>↑ {city.high}°C</Text>
                        {'   '}
                        <Text style={{ color: '#3B82F6', fontWeight: '700' }}>↓ {city.low}°C</Text>
                      </Text>
                      <View style={styles.rainRow}>
                        <Ionicons name="water" size={14} color="#3B82F6" />
                        <Text style={styles.rainText}>降雨機率 {city.rain}%</Text>
                      </View>
                    </View>
                  </View>
                </BlurView>
              </TouchableOpacity>

              {/* 今日油價 (中油) 玻璃卡片 */}
              <BlurView intensity={65} tint="light" style={styles.glassCard}>
                <View style={styles.oilHeaderRow}>
                  <Text style={styles.oilCardTitle}>今日油價 (中油)</Text>
                  <Text style={styles.oilUnit}>元/公升</Text>
                </View>
                <View style={styles.oilColumnsRow}>
                  <View style={styles.oilCol}>
                    <Text style={styles.oilColLabel}>92 無鉛</Text>
                    <Text style={styles.oilColPrice}>29.7</Text>
                  </View>
                  <View style={styles.oilColDivider} />
                  <View style={styles.oilCol}>
                    <Text style={[styles.oilColLabel, { color: '#BE185D', fontWeight: '700' }]}>95 無鉛</Text>
                    <Text style={[styles.oilColPrice, { color: '#BE185D' }]}>31.2</Text>
                  </View>
                  <View style={styles.oilColDivider} />
                  <View style={styles.oilCol}>
                    <Text style={styles.oilColLabel}>98 無鉛</Text>
                    <Text style={styles.oilColPrice}>33.2</Text>
                  </View>
                  <View style={styles.oilColDivider} />
                  <View style={styles.oilCol}>
                    <Text style={styles.oilColLabel}>超柴</Text>
                    <Text style={styles.oilColPrice}>28.1</Text>
                  </View>
                </View>
              </BlurView>
            </View>
          )}

          {/* -------------------- TAB 2: 我的車庫 -------------------- */}
          {activeTab === 'garage' && (
            <View style={styles.sectionStack}>
              {/* 全部 / 機車 / 汽車 分段毛玻璃切換器 */}
              <BlurView intensity={60} tint="light" style={styles.segmentedBar}>
                {[
                  { key: 'all', label: '全部' },
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

              {/* 車輛卡片清單 */}
              {filteredVehicles.map((v) => (
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
                              `車種：${v.typeLabel}\n平均油耗：${v.avgFuel} km/L\n強制險到期：剩餘 ${v.insuranceDays} 天`
                            )
                          }
                        >
                          <Ionicons name="ellipsis-horizontal" size={20} color="#9D174D" />
                        </TouchableOpacity>
                      </View>
                      {/* 粉紅邊框車牌徽章 */}
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

              {/* + 新增車輛 粉紅玻璃按鈕 */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setAddVehicleModalVisible(true)}
              >
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

              {/* 3x2 養車工具晶透玻璃格 */}
              <View style={styles.garageToolsGrid}>
                {[
                  { label: '加油紀錄', icon: 'water-outline', color: '#F97316', bg: '#FFEDD5', action: () => setRefuelModalVisible(true) },
                  { label: '保養紀錄', icon: 'build-outline', color: '#EC4899', bg: '#FCE7F3', action: () => Alert.alert('保養紀錄 🔧', '上次機油更換：5,000 km\n建議下次更換：10,000 km') },
                  { label: '油耗統計', icon: 'bar-chart-outline', color: '#8B5CF6', bg: '#EDE9FE', action: () => Alert.alert('油耗統計 📊', 'JET SL+ 158 平均油耗：39.2 km/L\nKawasaki Ninja 400：26.4 km/L') },
                  { label: '保險提醒', icon: 'shield-outline', color: '#3B82F6', bg: '#DBEAFE', action: () => Alert.alert('保險提醒 🛡️', 'JET SL+ 158 強制險將於 28 天後到期，建議提早線上續保！') },
                  { label: '驗車提醒', icon: 'checkmark-done-circle-outline', color: '#10B981', bg: '#D1FAE5', action: () => Alert.alert('驗車提醒 ✅', '目前車庫內所有車輛皆於合格定檢期內！') },
                  { label: '稅金提醒', icon: 'wallet-outline', color: '#F59E0B', bg: '#FEF3C7', action: () => Alert.alert('稅金提醒 💰', '四月牌照稅 / 七月燃料費繳納前 14 天將自動推播提醒您！') },
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

          {/* -------------------- TAB 3: 交通地圖 -------------------- */}
          {activeTab === 'map' && (
            <View style={styles.sectionStack}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {[
                  { key: 'gas', label: '⛽ 附近加油站' },
                  { key: 'traffic', label: '🚦 即時路況' },
                  { key: 'parking', label: '🅿️ 停車場空位' },
                  { key: 'dmv', label: '🏢 監理站據點' },
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

              {/* 地圖視覺預覽卡 */}
              <LinearGradient
                colors={['#E0F2FE', '#FCE7F3', '#F5D0FE']}
                style={styles.mapPreviewCard}
              >
                <Ionicons name="map" size={44} color="#DB2777" />
                <Text style={styles.mapPreviewTitle}>
                  {mapCategory === 'gas'
                    ? '附近中油直營加油站雷達'
                    : mapCategory === 'traffic'
                    ? 'TDX 國道與市區即時路況'
                    : mapCategory === 'parking'
                    ? '周邊立體停車場剩餘車位'
                    : '全台 37 處監理站即時導航'}
                </Text>
                <Text style={styles.mapPreviewSub}>定位區域：{city.name} • 即時同步中</Text>
              </LinearGradient>

              {/* 路況/據點清單 */}
              <BlurView intensity={65} tint="light" style={styles.glassCard}>
                <Text style={styles.oilCardTitle}>
                  {mapCategory === 'gas'
                    ? '推薦直營站點'
                    : mapCategory === 'traffic'
                    ? '國道車速簡報'
                    : mapCategory === 'parking'
                    ? '附近空位資訊'
                    : '鄰近監理所站'}
                </Text>

                {mapCategory === 'traffic' ? (
                  <View style={{ marginTop: 10, gap: 10 }}>
                    <View style={styles.listRow}>
                      <View style={[styles.roadBadge, { backgroundColor: '#2563EB' }]}>
                        <Text style={styles.roadBadgeText}>國 1</Text>
                      </View>
                      <Text style={styles.listRowTitle}>林口 ➔ 五股交流道</Text>
                      <Text style={[styles.listRowRight, { color: '#D97706' }]}>62 km/h</Text>
                    </View>
                    <View style={styles.softDivider} />
                    <View style={styles.listRow}>
                      <View style={[styles.roadBadge, { backgroundColor: '#10B981' }]}>
                        <Text style={styles.roadBadgeText}>國 3</Text>
                      </View>
                      <Text style={styles.listRowTitle}>新店 ➔ 木柵路段</Text>
                      <Text style={[styles.listRowRight, { color: '#059669' }]}>92 km/h</Text>
                    </View>
                  </View>
                ) : mapCategory === 'gas' ? (
                  <View style={{ marginTop: 10, gap: 10 }}>
                    <View style={styles.listRow}>
                      <Ionicons name="flame" size={18} color="#F97316" />
                      <Text style={[styles.listRowTitle, { marginLeft: 8 }]}>中油 林口文化二路直營站</Text>
                      <Text style={[styles.listRowRight, { color: '#059669' }]}>0.6 km</Text>
                    </View>
                    <View style={styles.softDivider} />
                    <View style={styles.listRow}>
                      <Ionicons name="flame" size={18} color="#F97316" />
                      <Text style={[styles.listRowTitle, { marginLeft: 8 }]}>中油 龜山復興一路站（自助）</Text>
                      <Text style={[styles.listRowRight, { color: '#059669' }]}>1.4 km</Text>
                    </View>
                  </View>
                ) : mapCategory === 'parking' ? (
                  <View style={{ marginTop: 10, gap: 10 }}>
                    <View style={styles.listRow}>
                      <Ionicons name="car" size={18} color="#2563EB" />
                      <Text style={[styles.listRowTitle, { marginLeft: 8 }]}>三井 Outlet 室內停車場</Text>
                      <Text style={[styles.listRowRight, { color: '#059669' }]}>剩 128 位</Text>
                    </View>
                    <View style={styles.softDivider} />
                    <View style={styles.listRow}>
                      <Ionicons name="car" size={18} color="#2563EB" />
                      <Text style={[styles.listRowTitle, { marginLeft: 8 }]}>林口國民運動中心地下站</Text>
                      <Text style={[styles.listRowRight, { color: '#D97706' }]}>剩 24 位</Text>
                    </View>
                  </View>
                ) : (
                  <View style={{ marginTop: 10, gap: 10 }}>
                    <View style={styles.listRow}>
                      <Ionicons name="business" size={18} color="#DB2777" />
                      <Text style={[styles.listRowTitle, { marginLeft: 8 }]}>臺北區監理所（樹林）</Text>
                      <Text style={[styles.listRowRight, { color: '#DB2777' }]}>營業中</Text>
                    </View>
                    <View style={styles.softDivider} />
                    <View style={styles.listRow}>
                      <Ionicons name="business" size={18} color="#DB2777" />
                      <Text style={[styles.listRowTitle, { marginLeft: 8 }]}>桃園監理站</Text>
                      <Text style={[styles.listRowRight, { color: '#DB2777' }]}>營業中</Text>
                    </View>
                  </View>
                )}
              </BlurView>
            </View>
          )}

          {/* -------------------- TAB 4: 服務大廳 -------------------- */}
          {activeTab === 'services' && (
            <View style={styles.sectionStack}>
              {/* 考照服務 */}
              <Text style={styles.sectionTitle}>考照服務</Text>
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => openExternal('https://exam.mmlovenn.com', '考照報名助手')}
              >
                <BlurView intensity={68} tint="light" style={styles.serviceBannerCard}>
                  <View style={[styles.serviceLeadIcon, { backgroundColor: '#FCE7F3' }]}>
                    <Ionicons name="id-card" size={26} color="#DB2777" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.serviceCardTitle}>考照報名助手</Text>
                    <Text style={styles.serviceCardSub}>報名・題庫・模擬測驗・37 站秒搶雷達</Text>
                  </View>
                  <Image source={require('./assets/icon.png')} style={styles.serviceMascotMini} />
                </BlurView>
              </TouchableOpacity>

              {/* 車牌服務 */}
              <Text style={styles.sectionTitle}>車牌服務</Text>
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => openExternal('https://plate.mmlovenn.com', '車牌尋找助手')}
              >
                <BlurView intensity={68} tint="light" style={styles.serviceBannerCard}>
                  <View style={styles.pinkPlateBadgeLarge}>
                    <Text style={styles.pinkPlateTextLarge}>9969</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.serviceCardTitle}>車牌尋找 ＆ 代辦服務</Text>
                    <Text style={styles.serviceCardSub}>14 車種庫存查詢・新車領牌・過戶・標牌</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9D174D" />
                </BlurView>
              </TouchableOpacity>

              {/* 交通相關 4 格 */}
              <Text style={styles.sectionTitle}>交通相關</Text>
              <View style={styles.quickGrid}>
                {[
                  { label: '油價查詢', icon: 'flame', color: '#F97316', bg: '#FFEDD5', onPress: () => setActiveTab('home') },
                  { label: '停車資訊', icon: 'location', color: '#2563EB', bg: '#DBEAFE', onPress: () => { setMapCategory('parking'); setActiveTab('map'); } },
                  { label: '即時路況', icon: 'car', color: '#EC4899', bg: '#FCE7F3', onPress: () => { setMapCategory('traffic'); setActiveTab('map'); } },
                  { label: '交通管制', icon: 'warning', color: '#EA580C', bg: '#FFEDD5', onPress: () => Alert.alert('交通管制', '目前國道與快速道路無重大封閉管制！') },
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

              {/* 生活工具 4 格 */}
              <Text style={styles.sectionTitle}>生活工具</Text>
              <View style={styles.quickGrid}>
                {[
                  { label: '天氣資訊', icon: 'partly-sunny', color: '#0EA5E9', bg: '#E0F2FE', onPress: () => setActiveTab('home') },
                  { label: '空氣品質', icon: 'cloud-outline', color: '#84CC16', bg: '#ECFCCB', onPress: () => Alert.alert('空氣品質 AQI', `${city.name} AQI：32（良好 🟢）\n適合騎車出遊！`) },
                  { label: '旅遊景點', icon: 'trail-sign', color: '#14B8A6', bg: '#CCFBF1', onPress: () => Alert.alert('鍋巴推薦景點 🌸', '本週熱門跑山/兜風路線：北宜公路、陽明山巴拉卡、台三線浪漫大道！') },
                  { label: '活動資訊', icon: 'calendar', color: '#EC4899', bg: '#FCE7F3', onPress: () => Alert.alert('車友活動資訊', '週末車聚與改裝展資訊持續更新中！') },
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

          {/* -------------------- TAB 5: 我的（Google 一鍵登入互通） -------------------- */}
          {activeTab === 'profile' && (
            <View style={styles.sectionStack}>
              {user ? (
                <BlurView intensity={72} tint="light" style={styles.glassCard}>
                  <View style={styles.profileTopRow}>
                    <Image
                      source={user.picture ? { uri: user.picture } : require('./assets/icon.png')}
                      style={styles.profileAvatar}
                    />
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.profileName}>{user.name}</Text>
                        <View style={user.role === 'admin' ? styles.adminBadge : styles.vipBadge}>
                          <Text style={user.role === 'admin' ? styles.adminBadgeText : styles.vipBadgeText}>
                            {user.role === 'admin' ? '管理員' : 'VIP'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.profileEmail}>{user.email}</Text>
                      <Text style={styles.syncStatusText}>🟢 與 mmlovenn.com 帳號互通中</Text>
                    </View>
                  </View>

                  <View style={styles.quotaRow}>
                    <View style={styles.quotaCol}>
                      <Text style={styles.quotaVal}>{user.task_quota || 2}</Text>
                      <Text style={styles.quotaLbl}>監控配額</Text>
                    </View>
                    <View style={styles.oilColDivider} />
                    <View style={styles.quotaCol}>
                      <Text style={[styles.quotaVal, { color: '#059669' }]}>無限制</Text>
                      <Text style={styles.quotaLbl}>車牌查詢</Text>
                    </View>
                    <View style={styles.oilColDivider} />
                    <View style={styles.quotaCol}>
                      <Text style={[styles.quotaVal, { color: '#DB2777' }]}>已啟用</Text>
                      <Text style={styles.quotaLbl}>即時推播</Text>
                    </View>
                  </View>

                  <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                    <Text style={styles.logoutBtnText}>登出此帳號</Text>
                  </TouchableOpacity>
                </BlurView>
              ) : (
                <BlurView intensity={72} tint="light" style={styles.loginGlassCard}>
                  <Image source={require('./assets/icon.png')} style={styles.loginLogo} />
                  <Text style={styles.loginTitle}>登入 鍋巴 GOBA</Text>
                  <Text style={styles.loginSubtitle}>
                    使用與網站相同的 Google 帳號登入，立即同步車牌收藏、監控任務與 VIP 專屬權限！
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

                  <TouchableOpacity style={styles.demoLinkBtn} onPress={showDemoLoginPrompt}>
                    <Text style={styles.demoLinkText}>快速體驗管理員帳號連動 ➔</Text>
                  </TouchableOpacity>
                </BlurView>
              )}

              {/* 設定清單 */}
              <BlurView intensity={65} tint="light" style={styles.glassCard}>
                <Text style={styles.oilCardTitle}>帳號與系統設定</Text>
                <TouchableOpacity
                  style={styles.settingItem}
                  onPress={() => Alert.alert('LINE 綁定', '已同步官方 LINE 帳號推播設定！')}
                >
                  <View style={styles.settingLeft}>
                    <Ionicons name="chatbubble-ellipses-outline" size={18} color="#059669" />
                    <Text style={styles.settingText}>LINE 官方帳號推播</Text>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#059669' }}>已綁定 ✓</Text>
                </TouchableOpacity>
                <View style={styles.softDivider} />
                <TouchableOpacity
                  style={styles.settingItem}
                  onPress={() => Alert.alert('推播通知', '已開啟油價預測、強制險到期與車牌釋出通知！')}
                >
                  <View style={styles.settingLeft}>
                    <Ionicons name="notifications-outline" size={18} color="#DB2777" />
                    <Text style={styles.settingText}>App 原生即時推播</Text>
                  </View>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#DB2777' }}>全開啟</Text>
                </TouchableOpacity>
                <View style={styles.softDivider} />
                <TouchableOpacity
                  style={styles.settingItem}
                  onPress={() => Alert.alert('關於 鍋巴 GOBA', '鍋巴 GOBA v2.0 (Sakura Liquid Glass)\n© 2026 mmlovenn.com')}
                >
                  <View style={styles.settingLeft}>
                    <Ionicons name="sparkles-outline" size={18} color="#8B5CF6" />
                    <Text style={styles.settingText}>關於 鍋巴 GOBA</Text>
                  </View>
                  <Text style={{ fontSize: 12, color: '#9CA3AF' }}>v2.0 Liquid Glass</Text>
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

        {/* ==================== 加油記帳毛玻璃彈窗 ==================== */}
        <Modal visible={refuelModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <BlurView intensity={90} tint="light" style={styles.modalGlassSheet}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>⛽ 新增加油紀錄</Text>
                <TouchableOpacity onPress={() => setRefuelModalVisible(false)}>
                  <Ionicons name="close-circle" size={26} color="#9D174D" />
                </TouchableOpacity>
              </View>
              <Text style={styles.modalSub}>目標車輛：{vehicles[0]?.nickname}</Text>

              <Text style={styles.inputLabel}>加油公升數 (L)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                placeholder="例如：6.2"
                value={refuelLiters}
                onChangeText={setRefuelLiters}
              />

              <Text style={styles.inputLabel}>總金額 (NT$)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                placeholder="例如：190"
                value={refuelAmount}
                onChangeText={setRefuelAmount}
              />

              <Text style={styles.inputLabel}>當前儀表總里程 (km)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                placeholder={`前次里程：${vehicles[0]?.mileage}`}
                value={refuelKm}
                onChangeText={setRefuelKm}
              />

              <TouchableOpacity style={styles.primaryPinkBtn} onPress={handleAddRefuel}>
                <Text style={styles.primaryPinkBtnText}>儲存並計算實測油耗</Text>
              </TouchableOpacity>
            </BlurView>
          </View>
        </Modal>

        {/* ==================== 新增車輛毛玻璃彈窗 ==================== */}
        <Modal visible={addVehicleModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <BlurView intensity={45} tint="dark" style={StyleSheet.absoluteFill} />
            <BlurView intensity={90} tint="light" style={styles.modalGlassSheet}>
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
  rootGradient: {
    flex: 1,
  },
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
  safeArea: {
    flex: 1,
  },
  // 頂部導覽
  homeTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topMascotLogo: {
    width: 34,
    height: 34,
    borderRadius: 12,
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  homeBrandTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#5B2333',
    letterSpacing: 0.4,
  },
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
  centeredTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#5B2333',
  },
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
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 118,
  },
  sectionStack: {
    gap: 14,
  },
  // 櫻花粉 Hero Banner
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
    shadowColor: '#BE185D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  heroMascotImg: {
    width: '100%',
    height: '100%',
    borderRadius: 18,
  },
  heroTextCol: {
    flex: 1,
    marginLeft: 14,
  },
  heroTitle: {
    fontSize: 23,
    fontWeight: '900',
    color: '#6B1D3A',
    letterSpacing: 0.5,
  },
  heroSubtitlePill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
  },
  heroSubtitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9D174D',
  },
  heroUserGreeting: {
    fontSize: 11,
    fontWeight: '700',
    color: '#BE185D',
    marginTop: 5,
  },
  // 4x2 快捷毛玻璃格
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  quickTileWrapper: {
    width: '23.4%',
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
    shadowColor: '#BE185D',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
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
  quickTileLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5B2333',
  },
  // 區塊標題
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#5B2333',
  },
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
  refreshText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9D174D',
  },
  // 通用毛玻璃卡片
  glassCard: {
    borderRadius: 22,
    padding: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.92)',
    shadowColor: '#BE185D',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
  },
  // 天氣卡片
  weatherRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  weatherLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  weatherIconCircle: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: 'rgba(254, 243, 199, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  weatherLocation: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9D174D',
  },
  weatherTemp: {
    fontSize: 28,
    fontWeight: '900',
    color: '#3B1525',
    lineHeight: 34,
  },
  weatherDesc: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7C6270',
  },
  weatherRight: {
    alignItems: 'flex-end',
    gap: 8,
  },
  weatherHiLo: {
    fontSize: 13,
  },
  rainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(224, 242, 254, 0.75)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  rainText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E40AF',
  },
  // 油價卡片
  oilHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  oilCardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#5B2333',
  },
  oilUnit: {
    fontSize: 11,
    color: '#9D174D',
    fontWeight: '600',
  },
  oilColumnsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  oilCol: {
    flex: 1,
    alignItems: 'center',
  },
  oilColDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(244, 114, 182, 0.22)',
  },
  oilColLabel: {
    fontSize: 11,
    color: '#7C6270',
    marginBottom: 4,
  },
  oilColPrice: {
    fontSize: 18,
    fontWeight: '900',
    color: '#3B1525',
  },
  // 車庫分段器
  segmentedBar: {
    flexDirection: 'row',
    borderRadius: 22,
    padding: 4,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.58)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 18,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: 'rgba(244, 114, 182, 0.28)',
    borderWidth: 1,
    borderColor: 'rgba(244, 114, 182, 0.45)',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7C6270',
  },
  segmentTextActive: {
    color: '#9D174D',
    fontWeight: '900',
  },
  // 車庫車輛卡片
  garageVehicleCard: {
    borderRadius: 22,
    padding: 15,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#BE185D',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  garageTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleThumbBox: {
    width: 68,
    height: 60,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  vehicleTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vehicleName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#3B1525',
  },
  pinkPlateBadge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 14,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#FFF0F6',
    borderWidth: 1.5,
    borderColor: '#F472B6',
  },
  pinkPlateText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#BE185D',
    letterSpacing: 1.4,
  },
  garageMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(244, 114, 182, 0.16)',
  },
  garageMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  garageMetaText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B4C5A',
  },
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
  addVehicleWideText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#9D174D',
  },
  garageToolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  garageToolWrapper: {
    width: '31.5%',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.3,
    borderColor: 'rgba(255, 255, 255, 0.92)',
  },
  garageToolGlass: {
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.62)',
  },
  garageToolIconBox: {
    width: 44,
    height: 44,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  garageToolLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#5B2333',
  },
  // 地圖分頁
  mapFilterPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
    borderWidth: 1.2,
    borderColor: 'rgba(255, 255, 255, 0.92)',
  },
  mapFilterPillActive: {
    backgroundColor: '#EC4899',
    borderColor: '#EC4899',
  },
  mapFilterText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7C6270',
  },
  mapFilterTextActive: {
    color: '#FFFFFF',
  },
  mapPreviewCard: {
    borderRadius: 24,
    paddingVertical: 32,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  mapPreviewTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#5B2333',
    marginTop: 10,
  },
  mapPreviewSub: {
    fontSize: 12,
    color: '#9D174D',
    marginTop: 4,
    fontWeight: '600',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  roadBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    marginRight: 10,
  },
  roadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  listRowTitle: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#3B1525',
  },
  listRowRight: {
    fontSize: 12,
    fontWeight: '800',
  },
  softDivider: {
    height: 1,
    backgroundColor: 'rgba(244, 114, 182, 0.16)',
    marginVertical: 6,
  },
  // 服務分頁
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
  serviceLeadIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceCardTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#3B1525',
  },
  serviceCardSub: {
    fontSize: 11,
    color: '#7C6270',
    marginTop: 3,
    fontWeight: '500',
  },
  serviceMascotMini: {
    width: 48,
    height: 48,
    borderRadius: 16,
    marginLeft: 8,
  },
  pinkPlateBadgeLarge: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#FFF0F6',
    borderWidth: 1.8,
    borderColor: '#F472B6',
  },
  pinkPlateTextLarge: {
    fontSize: 13,
    fontWeight: '900',
    color: '#BE185D',
    letterSpacing: 1,
  },
  // 我的（登入與會員）
  loginGlassCard: {
    borderRadius: 26,
    padding: 24,
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
  },
  loginLogo: {
    width: 68,
    height: 68,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#F472B6',
    marginBottom: 12,
  },
  loginTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: '#5B2333',
  },
  loginSubtitle: {
    fontSize: 12,
    color: '#7C6270',
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 6,
    marginBottom: 20,
  },
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
    shadowColor: '#BE185D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  googleBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#3B1525',
  },
  demoLinkBtn: {
    marginTop: 14,
    paddingVertical: 6,
  },
  demoLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DB2777',
  },
  profileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#EC4899',
  },
  profileName: {
    fontSize: 17,
    fontWeight: '900',
    color: '#3B1525',
  },
  profileEmail: {
    fontSize: 12,
    color: '#7C6270',
    marginTop: 2,
  },
  syncStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    marginTop: 4,
  },
  adminBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  adminBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
  },
  vipBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 8,
  },
  vipBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
  },
  quotaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 245, 249, 0.78)',
    borderRadius: 16,
    paddingVertical: 12,
    marginTop: 16,
  },
  quotaCol: {
    flex: 1,
    alignItems: 'center',
  },
  quotaVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#3B1525',
  },
  quotaLbl: {
    fontSize: 10,
    color: '#7C6270',
    marginTop: 2,
  },
  logoutBtn: {
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(254, 226, 226, 0.72)',
    alignItems: 'center',
  },
  logoutBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 11,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  settingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#3B1525',
  },
  // 浮空 Apple Liquid Glass 底部導覽列
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
  liquidTabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 28,
  },
  liquidTabItemActive: {
    backgroundColor: 'rgba(244, 114, 182, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.85)',
  },
  liquidTabLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#7C6270',
    marginTop: 2,
  },
  liquidTabLabelActive: {
    color: '#DB2777',
    fontWeight: '900',
  },
  // 彈窗
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalGlassSheet: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: 24,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 245, 249, 0.92)',
    borderTopWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#5B2333',
  },
  modalSub: {
    fontSize: 12,
    color: '#9D174D',
    marginBottom: 14,
    fontWeight: '600',
  },
  categorySwitchRow: {
    flexDirection: 'row',
    gap: 10,
    marginVertical: 10,
  },
  catBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3D1E2',
  },
  catBtnActive: {
    backgroundColor: '#EC4899',
    borderColor: '#EC4899',
  },
  catBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7C6270',
  },
  catBtnTextActive: {
    color: '#FFFFFF',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5B2333',
    marginTop: 10,
    marginBottom: 5,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
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
    marginTop: 18,
    shadowColor: '#EC4899',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  primaryPinkBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
});
