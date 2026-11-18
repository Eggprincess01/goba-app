import React, { useState } from 'react';
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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

type TabType = 'today' | 'garage' | 'services' | 'profile';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('today');
  const [selectedCity, setSelectedCity] = useState('台北市');

  // 車庫狀態範例資料
  const [vehicles, setVehicles] = useState([
    {
      id: '1',
      nickname: '我的曼巴 MMBCU',
      plate: 'PHP-9969',
      type: '普通重型機車',
      mileage: 6280,
      avgFuel: 38.5,
      insuranceDays: 28,
      nextMaintKm: 720,
    },
    {
      id: '2',
      nickname: '家庭號 RAV4',
      plate: 'BMW-8888',
      type: '自用小客車',
      mileage: 24500,
      avgFuel: 14.8,
      insuranceDays: 142,
      nextMaintKm: 1500,
    },
  ]);
  const [currentVehicleIndex, setCurrentVehicleIndex] = useState(0);

  // 彈窗狀態
  const [refuelModalVisible, setRefuelModalVisible] = useState(false);
  const [refuelLiters, setRefuelLiters] = useState('');
  const [refuelAmount, setRefuelAmount] = useState('');
  const [refuelKm, setRefuelKm] = useState('');

  const currentVehicle = vehicles[currentVehicleIndex];

  const handleAddRefuel = () => {
    if (!refuelLiters || !refuelAmount || !refuelKm) {
      Alert.alert('提醒', '請完整填寫加油公升數、總金額與當前里程！');
      return;
    }
    Alert.alert('記帳成功 🎉', `已為【${currentVehicle.nickname}】記錄 ${refuelLiters} 公升，花費 NT$ ${refuelAmount} 元！平均油耗持續計算中。`);
    setRefuelModalVisible(false);
    setRefuelLiters('');
    setRefuelAmount('');
    setRefuelKm('');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />

      {/* 頂部品牌標題欄 */}
      <View style={styles.topHeader}>
        <View style={styles.brandRow}>
          <Image source={require('./assets/icon.png')} style={styles.brandLogo} />
          <View>
            <Text style={styles.brandName}>鍋巴 GOBA</Text>
            <Text style={styles.brandSubtitle}>全民交通生活助手</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.cityPill}
          onPress={() => {
            const nextCity = selectedCity === '台北市' ? '台中市' : selectedCity === '台中市' ? '高雄市' : '台北市';
            setSelectedCity(nextCity);
          }}
        >
          <Text style={styles.cityPillText}>📍 {selectedCity} ▾</Text>
        </TouchableOpacity>
      </View>

      {/* 主要內容滑動區域 */}
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

        {/* ----------------- TAB 1: 今日交通 ----------------- */}
        {activeTab === 'today' && (
          <View style={styles.tabContent}>
            {/* 鍋巴看板娘問候氣泡 */}
            <View style={styles.mascotGreetingCard}>
              <View style={styles.greetingHeader}>
                <Text style={styles.greetingMascotText}>🛵 鍋巴即時路況助手</Text>
                <Text style={styles.greetingBadge}>即時巡檢中</Text>
              </View>
              <Text style={styles.greetingBody}>
                早安！今天 {selectedCity} 天氣舒適，午後山區有局部陣雨，騎車請記得攜帶雨衣與好心情喔！✨
              </Text>
            </View>

            {/* 1. 今日天氣 */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>🌤️ 今日天氣速報 (中央氣象署 CWA)</Text>
                <Text style={styles.cardSub}>剛剛更新</Text>
              </View>
              <View style={styles.weatherRow}>
                <View>
                  <Text style={styles.weatherTemp}>24°C</Text>
                  <Text style={styles.weatherDesc}>晴時多雲 • 舒適微涼</Text>
                </View>
                <View style={styles.weatherStats}>
                  <View style={styles.statChip}>
                    <Text style={styles.statChipLabel}>降雨機率</Text>
                    <Text style={styles.statChipValBlue}>15%</Text>
                  </View>
                  <View style={styles.statChip}>
                    <Text style={styles.statChipLabel}>紫外線指數</Text>
                    <Text style={styles.statChipValGreen}>低量級</Text>
                  </View>
                </View>
              </View>
              <Text style={styles.weatherTip}>💡 今日洗車指數：4 顆星（適宜洗車打蠟）</Text>
            </View>

            {/* 2. 即時油價 */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>⛽ 本週最新油價行情 (中油 CPC)</Text>
                <Text style={styles.cardSub}>本週維持平穩</Text>
              </View>
              <View style={styles.fuelGrid}>
                <View style={styles.fuelItem}>
                  <Text style={styles.fuelType}>92無鉛</Text>
                  <Text style={styles.fuelPrice}>29.8</Text>
                  <Text style={styles.fuelUnit}>元/L</Text>
                </View>
                <View style={[styles.fuelItem, styles.fuelItemHighlighted]}>
                  <Text style={[styles.fuelType, { color: '#B45309' }]}>95無鉛</Text>
                  <Text style={[styles.fuelPrice, { color: '#B45309' }]}>31.3</Text>
                  <Text style={styles.fuelUnit}>元/L</Text>
                </View>
                <View style={styles.fuelItem}>
                  <Text style={styles.fuelType}>98無鉛</Text>
                  <Text style={styles.fuelPrice}>33.3</Text>
                  <Text style={styles.fuelUnit}>元/L</Text>
                </View>
                <View style={styles.fuelItem}>
                  <Text style={styles.fuelType}>超級柴油</Text>
                  <Text style={styles.fuelPrice}>27.5</Text>
                  <Text style={styles.fuelUnit}>元/L</Text>
                </View>
              </View>
              <View style={styles.fuelAlertBox}>
                <Text style={styles.fuelAlertText}>
                  🔔 <Text style={{ fontWeight: 'bold' }}>下週油價預測：</Text>估調降 0.2 元，建議週末前可先稍作等候！
                </Text>
              </View>
            </View>

            {/* 3. 交通路況 TDX */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>🚗 即時道路與國道路況 (TDX)</Text>
                <Text style={styles.cardSub}>全線即時更新</Text>
              </View>
              <View style={styles.roadList}>
                <View style={styles.roadItem}>
                  <View style={styles.roadStatusDotGreen} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.roadName}>國道1號 (圓山 ➔ 台北交流道)</Text>
                    <Text style={styles.roadDetail}>車流順暢 • 平均時速 85 km/h</Text>
                  </View>
                  <Text style={styles.roadTagNormal}>正常</Text>
                </View>
                <View style={styles.roadItem}>
                  <View style={styles.roadStatusDotYellow} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.roadName}>台64線 (新店 ➔ 中和段)</Text>
                    <Text style={styles.roadDetail}>車多略為緩慢 • 平均時速 48 km/h</Text>
                  </View>
                  <Text style={styles.roadTagSlow}>車多</Text>
                </View>
              </View>
            </View>

            {/* 4. 今日快捷生活工具 */}
            <View style={styles.quickToolsGrid}>
              <TouchableOpacity style={styles.toolButton} onPress={() => setActiveTab('garage')}>
                <Text style={styles.toolIcon}>⛽</Text>
                <Text style={styles.toolTitle}>加油記帳</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolButton} onPress={() => setActiveTab('garage')}>
                <Text style={styles.toolIcon}>🔧</Text>
                <Text style={styles.toolTitle}>保養履歷</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolButton} onPress={() => setActiveTab('services')}>
                <Text style={styles.toolIcon}>🔍</Text>
                <Text style={styles.toolTitle}>車牌選號</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toolButton} onPress={() => setActiveTab('services')}>
                <Text style={styles.toolIcon}>🏍️</Text>
                <Text style={styles.toolTitle}>考照名額</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ----------------- TAB 2: 我的車庫 ----------------- */}
        {activeTab === 'garage' && (
          <View style={styles.tabContent}>
            {/* 車輛切換 Tab */}
            <View style={styles.vehicleSelectorRow}>
              {vehicles.map((v, idx) => (
                <TouchableOpacity
                  key={v.id}
                  style={[styles.vehicleTabBtn, currentVehicleIndex === idx && styles.vehicleTabBtnActive]}
                  onPress={() => setCurrentVehicleIndex(idx)}
                >
                  <Text style={[styles.vehicleTabText, currentVehicleIndex === idx && styles.vehicleTabTextActive]}>
                    {v.type.includes('機車') ? '🛵' : '🚗'} {v.nickname}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={styles.addVehicleBtn}
                onPress={() => Alert.alert('新增愛車', '即將開啟新增車輛表單，支援汽車、機車與重機！')}
              >
                <Text style={styles.addVehicleText}>＋</Text>
              </TouchableOpacity>
            </View>

            {/* 愛車主力卡片 */}
            <View style={styles.garageHeroCard}>
              <View style={styles.garageHeroHeader}>
                <View>
                  <Text style={styles.garagePlateNumber}>{currentVehicle.plate}</Text>
                  <Text style={styles.garageVehicleType}>{currentVehicle.type}</Text>
                </View>
                <View style={styles.garageTag}>
                  <Text style={styles.garageTagText}>已綁定管理</Text>
                </View>
              </View>

              {/* 核心數據 */}
              <View style={styles.garageStatRow}>
                <View style={styles.garageStatItem}>
                  <Text style={styles.garageStatLabel}>累積總里程</Text>
                  <Text style={styles.garageStatValue}>{currentVehicle.mileage.toLocaleString()}</Text>
                  <Text style={styles.garageStatUnit}>公里 (km)</Text>
                </View>
                <View style={styles.garageStatDivider} />
                <View style={styles.garageStatItem}>
                  <Text style={styles.garageStatLabel}>平均實測油耗</Text>
                  <Text style={[styles.garageStatValue, { color: '#059669' }]}>{currentVehicle.avgFuel}</Text>
                  <Text style={styles.garageStatUnit}>km / 公升</Text>
                </View>
              </View>

              {/* 加油記帳按鈕 */}
              <TouchableOpacity style={styles.refuelActionBtn} onPress={() => setRefuelModalVisible(true)}>
                <Text style={styles.refuelActionBtnText}>⛽ 立即記錄本次加油（計算油耗）</Text>
              </TouchableOpacity>
            </View>

            {/* 到期提醒項目 */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>⏰ 愛車專屬到期管家</Text>
              <View style={styles.reminderItem}>
                <View style={styles.reminderIconBox}>
                  <Text style={{ fontSize: 18 }}>🛡️</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reminderTitle}>強制汽車責任險</Text>
                  <Text style={styles.reminderSub}>距離保險到期還剩 {currentVehicle.insuranceDays} 天</Text>
                </View>
                <TouchableOpacity
                  style={styles.reminderActionBtn}
                  onPress={() => Alert.alert('提醒設定', '已開啟 LINE 到期即時推播通知！')}
                >
                  <Text style={styles.reminderActionText}>已設定推播</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.reminderItem}>
                <View style={[styles.reminderIconBox, { backgroundColor: '#FEE2E2' }]}>
                  <Text style={{ fontSize: 18 }}>🔧</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reminderTitle}>建議定期換機油/齒輪油</Text>
                  <Text style={styles.reminderSub}>距離建議里程還剩 {currentVehicle.nextMaintKm} km</Text>
                </View>
                <TouchableOpacity
                  style={styles.reminderActionBtn}
                  onPress={() => Alert.alert('保養登記', '可直接記錄保養店家與本次更換明細！')}
                >
                  <Text style={styles.reminderActionText}>去登記</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ----------------- TAB 3: 旗艦服務 ----------------- */}
        {activeTab === 'services' && (
          <View style={styles.tabContent}>
            {/* 車牌尋找助手 */}
            <View style={styles.serviceBigCard}>
              <View style={styles.serviceCardHeader}>
                <View style={[styles.serviceIconCircle, { backgroundColor: '#DBEAFE' }]}>
                  <Text style={{ fontSize: 24 }}>🚙</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.serviceTitle}>車牌尋找助手</Text>
                  <Text style={styles.serviceSub}>plate.mmlovenn.com</Text>
                </View>
                <Text style={styles.serviceBadgeBlue}>旗艦服務</Text>
              </View>
              <Text style={styles.serviceDescription}>
                支援全台 14 大車種、37 處監理所在庫車牌即時查詢。心儀號碼（如 8888、168）釋出時第一時間自動推播！
              </Text>
              <View style={styles.serviceFeatureList}>
                <Text style={styles.serviceFeatureText}>✓ 全台 14 大車種全覆蓋（汽車、機車、重機、電動車）</Text>
                <Text style={styles.serviceFeatureText}>✓ 易經靈動數吉凶鑑定 & 公路局即時標牌競標</Text>
              </View>
              <TouchableOpacity
                style={styles.serviceActionBtnBlue}
                onPress={() => Alert.alert('車牌尋找專區', '已為您同步全台 14 大車種最新在庫號牌資料！')}
              >
                <Text style={styles.serviceActionText}>進入車牌查詢專區 ➔</Text>
              </TouchableOpacity>
            </View>

            {/* 考照報名助手 */}
            <View style={styles.serviceBigCard}>
              <View style={styles.serviceCardHeader}>
                <View style={[styles.serviceIconCircle, { backgroundColor: '#D1FAE5' }]}>
                  <Text style={{ fontSize: 24 }}>🏍️</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.serviceTitle}>考照報名助手</Text>
                  <Text style={styles.serviceSub}>exam.mmlovenn.com</Text>
                </View>
                <Text style={styles.serviceBadgeGreen}>秒搶雷達</Text>
              </View>
              <Text style={styles.serviceDescription}>
                每 5 分鐘深入全台 37 處監理站官方考照場次，即時辨析初考與補考名額，退選釋出即時通知與秒搶！
              </Text>
              <View style={styles.serviceFeatureList}>
                <Text style={styles.serviceFeatureText}>✓ 37 站名額每 5 分鐘全天候不中斷監控</Text>
                <Text style={styles.serviceFeatureText}>✓ 晨間 08:00 黃金秒搶通道預約支援</Text>
              </View>
              <TouchableOpacity
                style={styles.serviceActionBtnGreen}
                onPress={() => Alert.alert('考照報名雷達', '全台監理站考照名額連線中，今日共有可預約場次！')}
              >
                <Text style={styles.serviceActionText}>開啟考照即時雷達 ➔</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ----------------- TAB 4: 會員中心 ----------------- */}
        {activeTab === 'profile' && (
          <View style={styles.tabContent}>
            {/* 會員卡片 */}
            <View style={styles.profileCard}>
              <Image source={require('./assets/icon.png')} style={styles.avatarImage} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={styles.profileName}>鍋巴車友會員</Text>
                <Text style={styles.profileEmail}>chengyouy13@gmail.com</Text>
                <View style={styles.vipBadge}>
                  <Text style={styles.vipBadgeText}>👑 VIP 永久尊榮會員</Text>
                </View>
              </View>
            </View>

            {/* 系統設定列表 */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>⚙️ 帳號與通知設定</Text>
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => Alert.alert('LINE 綁定', '已成功綁定官方 LINE 帳號，釋出通知即時接收！')}
              >
                <Text style={styles.settingLabel}>💬 LINE 官方帳號推播</Text>
                <Text style={styles.settingStatusGreen}>已綁定 ✓</Text>
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => Alert.alert('推播偏好', '已開啟出門天氣、下週油價與愛車保養提醒！')}
              >
                <Text style={styles.settingLabel}>🔔 App 原生即時推播</Text>
                <Text style={styles.settingStatusBlue}>全功能開啟</Text>
              </TouchableOpacity>
              <View style={styles.divider} />
              <TouchableOpacity
                style={styles.settingRow}
                onPress={() => Alert.alert('關於 鍋巴 GOBA', '鍋巴 GOBA (全民交通生活助手) v1.0.0\n版權所有 © 2026 mmlovenn.com')}
              >
                <Text style={styles.settingLabel}>ℹ️ 關於 鍋巴 GOBA</Text>
                <Text style={styles.settingStatusGray}>v1.0.0 ➔</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 底部品牌宣告 */}
        <View style={styles.footerNote}>
          <Text style={styles.footerNoteText}>鍋巴 GOBA • 全民交通生活平台</Text>
          <Text style={styles.footerSubText}>車牌尋找助手 • 考照報名助手 來自 鍋巴 GOBA</Text>
        </View>
      </ScrollView>

      {/* 底部原生導航欄 (Tab Bar) */}
      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('today')}>
          <Text style={[styles.navIcon, activeTab === 'today' && styles.navIconActive]}>🛵</Text>
          <Text style={[styles.navLabel, activeTab === 'today' && styles.navLabelActive]}>今日交通</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('garage')}>
          <Text style={[styles.navIcon, activeTab === 'garage' && styles.navIconActive]}>🚗</Text>
          <Text style={[styles.navLabel, activeTab === 'garage' && styles.navLabelActive]}>我的車庫</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('services')}>
          <Text style={[styles.navIcon, activeTab === 'services' && styles.navIconActive]}>🌟</Text>
          <Text style={[styles.navLabel, activeTab === 'services' && styles.navLabelActive]}>旗艦服務</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab('profile')}>
          <Text style={[styles.navIcon, activeTab === 'profile' && styles.navIconActive]}>👤</Text>
          <Text style={[styles.navLabel, activeTab === 'profile' && styles.navLabelActive]}>會員中心</Text>
        </TouchableOpacity>
      </View>

      {/* 加油記帳彈窗 Modal */}
      <Modal visible={refuelModalVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⛽ 記錄加油（{currentVehicle.nickname}）</Text>
              <TouchableOpacity onPress={() => setRefuelModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>加油公升數 (L)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="例如: 6.2"
                keyboardType="numeric"
                value={refuelLiters}
                onChangeText={setRefuelLiters}
              />

              <Text style={styles.inputLabel}>實付金額 (NTD)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="例如: 195"
                keyboardType="numeric"
                value={refuelAmount}
                onChangeText={setRefuelAmount}
              />

              <Text style={styles.inputLabel}>當前總里程數 (km)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="例如: 6450"
                keyboardType="numeric"
                value={refuelKm}
                onChangeText={setRefuelKm}
              />

              <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleAddRefuel}>
                <Text style={styles.modalSubmitText}>儲存記帳並計算油耗 ✨</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FCE7F3', // 鍋巴可愛柔和粉底色
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3E8FF',
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  brandLogo: {
    width: 38,
    height: 38,
    borderRadius: 12,
    marginRight: 10,
  },
  brandName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#831843',
    letterSpacing: -0.5,
  },
  brandSubtitle: {
    fontSize: 11,
    color: '#9D174D',
    fontWeight: '600',
  },
  cityPill: {
    backgroundColor: '#FDF2F8',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FBCFE8',
  },
  cityPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#BE185D',
  },
  scrollView: {
    flex: 1,
    backgroundColor: '#FAF5FF',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 24,
  },
  tabContent: {
    gap: 14,
  },
  mascotGreetingCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
  },
  greetingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  greetingMascotText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#B45309',
  },
  greetingBadge: {
    fontSize: 10,
    fontWeight: '800',
    backgroundColor: '#FEF3C7',
    color: '#92400E',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  greetingBody: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 19,
    fontWeight: '500',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#831843',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
  },
  cardSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  weatherRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  weatherTemp: {
    fontSize: 34,
    fontWeight: '900',
    color: '#0284C7',
    letterSpacing: -1,
  },
  weatherDesc: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  weatherStats: {
    flexDirection: 'row',
    gap: 8,
  },
  statChip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statChipLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '700',
  },
  statChipValBlue: {
    fontSize: 14,
    color: '#0284C7',
    fontWeight: '900',
  },
  statChipValGreen: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '900',
  },
  weatherTip: {
    fontSize: 12,
    color: '#475569',
    backgroundColor: '#F1F5F9',
    padding: 8,
    borderRadius: 10,
    marginTop: 4,
  },
  fuelGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  fuelItem: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 8,
    marginHorizontal: 3,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  fuelItemHighlighted: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  fuelType: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
  },
  fuelPrice: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    marginVertical: 2,
  },
  fuelUnit: {
    fontSize: 9,
    color: '#94A3B8',
  },
  fuelAlertBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  fuelAlertText: {
    fontSize: 12,
    color: '#1E40AF',
  },
  roadList: {
    gap: 10,
  },
  roadItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  roadStatusDotGreen: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    marginRight: 10,
  },
  roadStatusDotYellow: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
    marginRight: 10,
  },
  roadName: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  roadDetail: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  roadTagNormal: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  roadTagSlow: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  quickToolsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  toolButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  toolIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  toolTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  vehicleSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  vehicleTabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
  },
  vehicleTabBtnActive: {
    backgroundColor: '#831843',
  },
  vehicleTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  vehicleTabTextActive: {
    color: '#FFFFFF',
  },
  addVehicleBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  addVehicleText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#64748B',
    lineHeight: 20,
  },
  garageHeroCard: {
    backgroundColor: '#831843',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#831843',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 4,
  },
  garageHeroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  garagePlateNumber: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  garageVehicleType: {
    fontSize: 13,
    color: '#FBCFE8',
    marginTop: 2,
    fontWeight: '600',
  },
  garageTag: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  garageTagText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  garageStatRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 16,
  },
  garageStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  garageStatDivider: {
    width: 1,
    backgroundColor: '#F1F5F9',
  },
  garageStatLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 2,
  },
  garageStatValue: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  garageStatUnit: {
    fontSize: 10,
    color: '#94A3B8',
  },
  refuelActionBtn: {
    backgroundColor: '#F59E0B',
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  refuelActionBtnText: {
    color: '#78350F',
    fontSize: 13,
    fontWeight: '800',
  },
  reminderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  reminderIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#EDE9FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  reminderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  reminderSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  reminderActionBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  reminderActionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  serviceBigCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  serviceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  serviceIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  serviceSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  serviceBadgeBlue: {
    backgroundColor: '#DBEAFE',
    color: '#1E40AF',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  serviceBadgeGreen: {
    backgroundColor: '#D1FAE5',
    color: '#065F46',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  serviceDescription: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 12,
  },
  serviceFeatureList: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    gap: 6,
    marginBottom: 14,
  },
  serviceFeatureText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  serviceActionBtnBlue: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  serviceActionBtnGreen: {
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  serviceActionText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  avatarImage: {
    width: 60,
    height: 60,
    borderRadius: 20,
  },
  profileName: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
  },
  profileEmail: {
    fontSize: 12,
    color: '#64748B',
    marginVertical: 2,
  },
  vipBadge: {
    backgroundColor: '#FEF3C7',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  vipBadgeText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '800',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  settingLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  settingStatusGreen: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '800',
  },
  settingStatusBlue: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '800',
  },
  settingStatusGray: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#F1F5F9',
  },
  footerNote: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 10,
  },
  footerNoteText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#9D174D',
  },
  footerSubText: {
    fontSize: 10,
    color: '#BE185D',
    marginTop: 2,
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F3E8FF',
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 20 : 8,
  },
  navItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navIcon: {
    fontSize: 20,
    color: '#94A3B8',
    marginBottom: 2,
  },
  navIconActive: {
    transform: [{ scale: 1.15 }],
  },
  navLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
  },
  navLabelActive: {
    color: '#831843',
    fontWeight: '900',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCloseText: {
    fontSize: 18,
    color: '#94A3B8',
    fontWeight: '700',
    padding: 4,
  },
  modalBody: {
    gap: 10,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginTop: 4,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    fontSize: 14,
  },
  modalSubmitBtn: {
    backgroundColor: '#831843',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
