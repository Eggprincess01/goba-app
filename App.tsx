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

type TabType = 'today' | 'garage' | 'services' | 'profile';

interface UserProfile {
  email: string;
  name: string;
  picture?: string;
  role: string;
  task_quota?: number;
  is_admin?: boolean;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('today');
  const [selectedCity, setSelectedCity] = useState('台北市');

  // 使用者登入狀態（與網站 mmlovenn.com 互通）
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoadingAuth, setIsLoadingAuth] = useState(false);

  // 監聽 Deep Link 回傳（Google 登入後重導向）
  useEffect(() => {
    // 監聽 App 喚起事件
    const handleUrl = (event: { url: string }) => {
      processAuthUrl(event.url);
    };

    const subscription = Linking.addEventListener('url', handleUrl);

    // 檢查如果是冷啟動開起的 URL
    Linking.getInitialURL().then((url) => {
      if (url) processAuthUrl(url);
    });

    return () => {
      subscription.remove();
    };
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

  // Google 一鍵登入流程（原生 Linking 呼叫 mmlovenn.com）
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
    } catch (error) {
      showDemoLoginPrompt();
    } finally {
      setIsLoadingAuth(false);
    }
  };

  // 登出流程
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

  const showDemoLoginPrompt = () => {
    Alert.alert(
      'Google 快速同步連動',
      '是否直接以您的網站管理員帳號【chengyouy13@gmail.com】進行雙向連動體驗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '立即連動',
          onPress: () => {
            const demoUser: UserProfile = {
              email: 'chengyouy13@gmail.com',
              name: 'Cheng You (Eggprincess)',
              role: 'admin',
              task_quota: 20,
              is_admin: true,
            };
            setUser(demoUser);
            Alert.alert('連動成功 🎉', '已同步網站管理員 VIP 權限、車牌監控任務與名額雷達！');
          },
        },
      ]
    );
  };

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

      {/* 頂部動態晶透品牌導航 (Specular Glass Header) */}
      <View style={styles.glassHeader}>
        <View style={styles.brandRow}>
          <Image source={require('./assets/icon.png')} style={styles.brandLogo} />
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.brandName}>鍋巴 GOBA</Text>
              <View style={styles.glassPillMini}>
                <Text style={styles.glassPillMiniText}>PRO</Text>
              </View>
            </View>
            <Text style={styles.brandSubtitle}>全民交通生活助手</Text>
          </View>
        </View>
        <TouchableOpacity
          style={styles.cityPillGlass}
          onPress={() => {
            const nextCity = selectedCity === '台北市' ? '台中市' : selectedCity === '台中市' ? '高雄市' : '台北市';
            setSelectedCity(nextCity);
          }}
        >
          <Text style={styles.cityPillText}>📍 {selectedCity} ▾</Text>
        </TouchableOpacity>
      </View>

      {/* 主要內容滑動區域 */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ----------------- TAB 1: 今日交通 ----------------- */}
        {activeTab === 'today' && (
          <View style={styles.tabContent}>
            {/* 鍋巴動態晶透問候卡 */}
            <View style={styles.glassGreetingCard}>
              <View style={styles.greetingHeader}>
                <Image source={require('./assets/icon.png')} style={styles.greetingAvatar} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.greetingTitle}>
                    {user ? `早安，${user.name}！🐱` : '早安！今天出門記得安全第一 🐱'}
                  </Text>
                  <Text style={styles.greetingText}>
                    {selectedCity}目前天氣陰涼，建議攜帶雨具出門。中油今日油價平穩，可先觀察下週調幅！
                  </Text>
                </View>
              </View>
              <View style={styles.quickStatusRow}>
                <View style={styles.quickStatusItem}>
                  <Text style={styles.quickStatusLabel}>降雨機率</Text>
                  <Text style={styles.quickStatusValue}>20% ☁️</Text>
                </View>
                <View style={styles.quickStatusDivider} />
                <View style={styles.quickStatusItem}>
                  <Text style={styles.quickStatusLabel}>出門路況</Text>
                  <Text style={[styles.quickStatusValue, { color: '#059669' }]}>順暢通行 🟢</Text>
                </View>
                <View style={styles.quickStatusDivider} />
                <View style={styles.quickStatusItem}>
                  <Text style={styles.quickStatusLabel}>95無鉛</Text>
                  <Text style={styles.quickStatusValue}>$31.2/L ⛽</Text>
                </View>
              </View>
            </View>

            {/* 即時油價預報卡片 (Glassmorphism) */}
            <View style={styles.glassCard}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>⛽ 今日中油油價 & 下週預測</Text>
                <Text style={styles.tagGreen}>即時更新</Text>
              </View>
              <View style={styles.oilPriceGrid}>
                <View style={styles.oilPriceBox}>
                  <Text style={styles.oilName}>92 無鉛</Text>
                  <Text style={styles.oilPrice}>$29.7</Text>
                  <Text style={styles.oilDiff}>持平</Text>
                </View>
                <View style={[styles.oilPriceBox, styles.oilPriceBoxHighlight]}>
                  <Text style={[styles.oilName, { color: '#BE185D', fontWeight: 'bold' }]}>95 無鉛</Text>
                  <Text style={[styles.oilPrice, { color: '#BE185D', fontWeight: 'bold' }]}>$31.2</Text>
                  <Text style={styles.oilDiff}>主推</Text>
                </View>
                <View style={styles.oilPriceBox}>
                  <Text style={styles.oilName}>98 無鉛</Text>
                  <Text style={styles.oilPrice}>$33.2</Text>
                  <Text style={styles.oilDiff}>持平</Text>
                </View>
                <View style={styles.oilPriceBox}>
                  <Text style={styles.oilName}>超級柴油</Text>
                  <Text style={styles.oilPrice}>$27.5</Text>
                  <Text style={styles.oilDiff}>持平</Text>
                </View>
              </View>
              <View style={styles.forecastBanner}>
                <Text style={styles.forecastText}>💡 鍋巴預測：下週一估計「調降 0.1 元」，週末若非急用可稍後加！</Text>
              </View>
            </View>

            {/* 國道路況即時看 (Glassmorphism) */}
            <View style={styles.glassCard}>
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle}>🚦 國道車速即時簡報</Text>
                <Text style={styles.tagBlue}>TDX 交通數據</Text>
              </View>
              <View style={styles.highwayRow}>
                <View style={styles.highwayBadge}>
                  <Text style={styles.highwayBadgeText}>國 1</Text>
                </View>
                <Text style={styles.highwaySection}>圓山 ➔ 台北</Text>
                <Text style={[styles.highwaySpeed, { color: '#D97706' }]}>58 km/h (稍緩)</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.highwayRow}>
                <View style={[styles.highwayBadge, { backgroundColor: '#10B981' }]}>
                  <Text style={styles.highwayBadgeText}>國 3</Text>
                </View>
                <Text style={styles.highwaySection}>新店 ➔ 木柵</Text>
                <Text style={[styles.highwaySpeed, { color: '#059669' }]}>88 km/h (順暢)</Text>
              </View>
            </View>
          </View>
        )}

        {/* ----------------- TAB 2: 我的車庫 ----------------- */}
        {activeTab === 'garage' && (
          <View style={styles.tabContent}>
            {/* 車輛切換選擇器 */}
            <View style={styles.vehicleSelectorRow}>
              {vehicles.map((v, idx) => (
                <TouchableOpacity
                  key={v.id}
                  style={[
                    styles.vehiclePillGlass,
                    currentVehicleIndex === idx && styles.vehiclePillGlassActive,
                  ]}
                  onPress={() => setCurrentVehicleIndex(idx)}
                >
                  <Text
                    style={[
                      styles.vehiclePillText,
                      currentVehicleIndex === idx && styles.vehiclePillTextActive,
                    ]}
                  >
                    {idx === 0 ? '🛵' : '🚗'} {v.nickname}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* 主要車輛動態水晶卡片 */}
            <View style={styles.glassVehicleCard}>
              <View style={styles.vehicleCardTop}>
                <View>
                  <Text style={styles.vehicleCardType}>{currentVehicle.type}</Text>
                  <Text style={styles.vehicleCardNick}>{currentVehicle.nickname}</Text>
                </View>
                <View style={styles.plateTag}>
                  <Text style={styles.plateTagText}>{currentVehicle.plate}</Text>
                </View>
              </View>

              <View style={styles.vehicleStatsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statNum}>{currentVehicle.mileage.toLocaleString()}</Text>
                  <Text style={styles.statTitle}>總里程 (km)</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={[styles.statNum, { color: '#DB2777' }]}>{currentVehicle.avgFuel}</Text>
                  <Text style={styles.statTitle}>實測油耗 (km/L)</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statBox}>
                  <Text style={[styles.statNum, { color: '#059669' }]}>{currentVehicle.insuranceDays} 天</Text>
                  <Text style={styles.statTitle}>強制險到期</Text>
                </View>
              </View>

              <View style={styles.vehicleActionRow}>
                <TouchableOpacity
                  style={styles.actionBtnRefuel}
                  onPress={() => setRefuelModalVisible(true)}
                >
                  <Text style={styles.actionBtnText}>⛽ 快速加油記帳</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.actionBtnMaintain}
                  onPress={() => Alert.alert('保養紀錄', `下一次機油保養預估剩餘：${currentVehicle.nextMaintKm} km`)}
                >
                  <Text style={styles.actionBtnMaintainText}>🔧 保養歷程</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 智能車庫健檢提醒 */}
            <View style={styles.glassCard}>
              <Text style={styles.cardTitle}>🔔 鍋巴愛車健康提醒</Text>
              <View style={styles.reminderItem}>
                <Text style={styles.reminderIcon}>🛡️</Text>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.reminderTitle}>強制險即將到期（剩餘 28 天）</Text>
                  <Text style={styles.reminderSub}>國泰產險 • 建議於兩週內完成線上續保</Text>
                </View>
                <TouchableOpacity
                  style={styles.reminderActionBtn}
                  onPress={() => Alert.alert('線上續保', '即將開啟保險試算與線上續保專區')}
                >
                  <Text style={styles.reminderActionText}>續保</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.divider} />
              <View style={styles.reminderItem}>
                <Text style={styles.reminderIcon}>🛢️</Text>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.reminderTitle}>機油更換倒數（剩餘 720 km）</Text>
                  <Text style={styles.reminderSub}>上次換油於 5,000 km • 建議使用 10W-40</Text>
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
            <View style={styles.glassServiceCard}>
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
                <Text style={styles.serviceFeatureText}>✓ 與 App 帳號收藏車牌雙向同步</Text>
              </View>
              <TouchableOpacity
                style={styles.serviceActionBtnBlue}
                onPress={() => Alert.alert('車牌尋找專區', '已為您同步全台 14 大車種最新在庫號牌資料！')}
              >
                <Text style={styles.serviceActionText}>進入車牌查詢專區 ➔</Text>
              </TouchableOpacity>
            </View>

            {/* 考照報名助手 */}
            <View style={styles.glassServiceCard}>
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

        {/* ----------------- TAB 4: 會員中心 (含 Google 一鍵登入) ----------------- */}
        {activeTab === 'profile' && (
          <View style={styles.tabContent}>
            {user ? (
              // 已登入狀態卡片
              <View style={styles.glassProfileCard}>
                <View style={styles.profileTopRow}>
                  {user.picture ? (
                    <Image source={{ uri: user.picture }} style={styles.avatarImage} />
                  ) : (
                    <Image source={require('./assets/icon.png')} style={styles.avatarImage} />
                  )}
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.profileName}>{user.name || '鍋巴車友'}</Text>
                      {user.role === 'admin' ? (
                        <View style={styles.adminTag}>
                          <Text style={styles.adminTagText}>管理員</Text>
                        </View>
                      ) : (
                        <View style={styles.vipTag}>
                          <Text style={styles.vipTagText}>VIP</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.profileEmail}>{user.email}</Text>
                    <View style={styles.accountSyncBadge}>
                      <Text style={styles.accountSyncText}>🟢 網站 mmlovenn.com 互通中</Text>
                    </View>
                  </View>
                </View>

                {/* 權限統計 */}
                <View style={styles.quotaStatsRow}>
                  <View style={styles.quotaItem}>
                    <Text style={styles.quotaVal}>{user.task_quota || 2}</Text>
                    <Text style={styles.quotaLbl}>監控配額</Text>
                  </View>
                  <View style={styles.quotaDiv} />
                  <View style={styles.quotaItem}>
                    <Text style={[styles.quotaVal, { color: '#059669' }]}>無限制</Text>
                    <Text style={styles.quotaLbl}>車牌查詢</Text>
                  </View>
                  <View style={styles.quotaDiv} />
                  <View style={styles.quotaItem}>
                    <Text style={[styles.quotaVal, { color: '#DB2777' }]}>已點亮</Text>
                    <Text style={styles.quotaLbl}>推播權限</Text>
                  </View>
                </View>

                <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
                  <Text style={styles.logoutBtnText}>登出此帳號</Text>
                </TouchableOpacity>
              </View>
            ) : (
              // 未登入：Google 一鍵登入大卡片
              <View style={styles.glassLoginCard}>
                <Image source={require('./assets/icon.png')} style={styles.loginCardLogo} />
                <Text style={styles.loginCardTitle}>登入 鍋巴 GOBA</Text>
                <Text style={styles.loginCardSubtitle}>
                  登入同一個 Google 帳號，即時同步您在網站上的車牌收藏、VIP 權限與監控名額！
                </Text>

                <TouchableOpacity
                  style={styles.googleLoginBtn}
                  onPress={handleGoogleLogin}
                  disabled={isLoadingAuth}
                >
                  {isLoadingAuth ? (
                    <ActivityIndicator color="#1F2937" />
                  ) : (
                    <>
                      <Text style={{ fontSize: 18, marginRight: 10 }}>🌐</Text>
                      <Text style={styles.googleLoginBtnText}>以 Google 帳號一鍵登入</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.demoLoginBtn}
                  onPress={showDemoLoginPrompt}
                >
                  <Text style={styles.demoLoginBtnText}>快速體驗管理員連動 ➔</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* 系統設定列表 */}
            <View style={styles.glassCard}>
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
                onPress={() => Alert.alert('關於 鍋巴 GOBA', '鍋巴 GOBA (全民交通生活助手) v1.1.0\n版權所有 © 2026 mmlovenn.com\n支援 iOS GPU Metal 晶透高光渲染')}
              >
                <Text style={styles.settingLabel}>ℹ️ 關於 鍋巴 GOBA</Text>
                <Text style={styles.settingStatusGray}>v1.1.0 (PRO) ➔</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* 底部品牌宣告 */}
        <View style={styles.footerNote}>
          <Text style={styles.footerNoteText}>鍋巴 GOBA • 全民交通生活平台</Text>
          <Text style={styles.footerSubText}>iOS Liquid Specular Glass • mmlovenn.com 雲端連動</Text>
        </View>
      </ScrollView>

      {/* 底部動態晶透導航欄 (Specular Glass Tab Bar) */}
      <View style={styles.glassBottomNav}>
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
          <Text style={[styles.navLabel, activeTab === 'profile' && styles.navLabelActive]}>
            {user ? '我的會員' : '會員中心'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* 加油記帳彈窗 Modal */}
      <Modal visible={refuelModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalGlassContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>⛽ 新增加油紀錄</Text>
              <TouchableOpacity onPress={() => setRefuelModalVisible(false)}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.modalSub}>車輛：{currentVehicle.nickname} ({currentVehicle.plate})</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>加油公升數 (L)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                placeholder="例如：6.2"
                value={refuelLiters}
                onChangeText={setRefuelLiters}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>總金額 (NT$)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                placeholder="例如：190"
                value={refuelAmount}
                onChangeText={setRefuelAmount}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>當前儀表總里程 (km)</Text>
              <TextInput
                style={styles.textInput}
                keyboardType="numeric"
                placeholder={`前次里程：${currentVehicle.mileage}`}
                value={refuelKm}
                onChangeText={setRefuelKm}
              />
            </View>

            <TouchableOpacity style={styles.submitBtn} onPress={handleAddRefuel}>
              <Text style={styles.submitBtnText}>儲存並計算實測油耗</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FDF2F8', // 鍋巴柔粉暖白背景
  },
  glassHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: 'rgba(255, 255, 255, 0.85)',
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    shadowColor: '#EC4899',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
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
    borderWidth: 1,
    borderColor: 'rgba(244, 114, 182, 0.3)',
  },
  brandName: {
    fontSize: 18,
    fontWeight: '900',
    color: '#831843',
    letterSpacing: 0.5,
  },
  glassPillMini: {
    backgroundColor: 'rgba(236, 72, 153, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    marginLeft: 6,
  },
  glassPillMiniText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DB2777',
  },
  brandSubtitle: {
    fontSize: 11,
    color: '#9D174D',
    fontWeight: '500',
  },
  cityPillGlass: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(244, 114, 182, 0.4)',
    shadowColor: '#BE185D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cityPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9D174D',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 110,
  },
  tabContent: {
    gap: 14,
  },
  // 動態晶透問候卡
  glassGreetingCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#EC4899',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  greetingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  greetingAvatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#F472B6',
  },
  greetingTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#831843',
    marginBottom: 3,
  },
  greetingText: {
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 18,
  },
  quickStatusRow: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(244, 114, 182, 0.2)',
  },
  quickStatusItem: {
    flex: 1,
    alignItems: 'center',
  },
  quickStatusDivider: {
    width: 1,
    backgroundColor: 'rgba(244, 114, 182, 0.2)',
  },
  quickStatusLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginBottom: 4,
  },
  quickStatusValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2937',
  },
  // 通用動態晶透卡片 (Glassmorphism Card)
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1F2937',
  },
  tagGreen: {
    backgroundColor: 'rgba(209, 250, 229, 0.8)',
    color: '#047857',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagBlue: {
    backgroundColor: 'rgba(219, 234, 254, 0.8)',
    color: '#1D4ED8',
    fontSize: 11,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  oilPriceGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  oilPriceBox: {
    flex: 1,
    backgroundColor: 'rgba(249, 250, 251, 0.75)',
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.8)',
  },
  oilPriceBoxHighlight: {
    backgroundColor: 'rgba(253, 242, 248, 0.92)',
    borderColor: 'rgba(244, 114, 182, 0.6)',
  },
  oilName: {
    fontSize: 11,
    color: '#6B7280',
    marginBottom: 2,
  },
  oilPrice: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111827',
  },
  oilDiff: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  forecastBanner: {
    marginTop: 10,
    backgroundColor: 'rgba(254, 243, 199, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  forecastText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
  },
  highwayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  highwayBadge: {
    backgroundColor: '#3B82F6',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginRight: 10,
  },
  highwayBadgeText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '800',
  },
  highwaySection: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  highwaySpeed: {
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(243, 244, 246, 0.8)',
    marginVertical: 8,
  },
  // 車庫晶透樣式
  vehicleSelectorRow: {
    flexDirection: 'row',
    gap: 10,
  },
  vehiclePillGlass: {
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.9)',
  },
  vehiclePillGlassActive: {
    backgroundColor: '#EC4899',
    borderColor: '#EC4899',
  },
  vehiclePillText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
  },
  vehiclePillTextActive: {
    color: '#FFFFFF',
  },
  glassVehicleCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderRadius: 24,
    padding: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.98)',
    shadowColor: '#DB2777',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  vehicleCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  vehicleCardType: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  vehicleCardNick: {
    fontSize: 20,
    fontWeight: '900',
    color: '#1F2937',
    marginTop: 2,
  },
  plateTag: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#475569',
  },
  plateTagText: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  vehicleStatsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(249, 250, 251, 0.8)',
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(243, 244, 246, 0.9)',
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(229, 231, 235, 0.8)',
  },
  statNum: {
    fontSize: 17,
    fontWeight: '900',
    color: '#1F2937',
  },
  statTitle: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 3,
  },
  vehicleActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  actionBtnRefuel: {
    flex: 1.2,
    backgroundColor: '#EC4899',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#EC4899',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  actionBtnMaintain: {
    flex: 1,
    backgroundColor: 'rgba(243, 244, 246, 0.9)',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.9)',
  },
  actionBtnMaintainText: {
    color: '#4B5563',
    fontWeight: '700',
    fontSize: 13,
  },
  reminderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  reminderIcon: {
    fontSize: 22,
  },
  reminderTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2937',
  },
  reminderSub: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  reminderActionBtn: {
    backgroundColor: 'rgba(253, 242, 248, 0.9)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(244, 114, 182, 0.5)',
  },
  reminderActionText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#BE185D',
  },
  // 旗艦服務樣式
  glassServiceCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
  },
  serviceCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  serviceTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1F2937',
  },
  serviceSub: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  serviceBadgeBlue: {
    backgroundColor: '#EFF6FF',
    color: '#2563EB',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  serviceBadgeGreen: {
    backgroundColor: '#ECFDF5',
    color: '#059669',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  serviceDescription: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 18,
    marginTop: 12,
  },
  serviceFeatureList: {
    marginTop: 10,
    gap: 4,
  },
  serviceFeatureText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  serviceActionBtnBlue: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  serviceActionBtnGreen: {
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  serviceActionText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  // 會員中心樣式
  glassProfileCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.98)',
    shadowColor: '#EC4899',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 14,
  },
  profileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarImage: {
    width: 54,
    height: 54,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#EC4899',
  },
  profileName: {
    fontSize: 17,
    fontWeight: '900',
    color: '#1F2937',
  },
  profileEmail: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  adminTag: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  adminTagText: {
    color: '#DC2626',
    fontSize: 10,
    fontWeight: '800',
  },
  vipTag: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  vipTagText: {
    color: '#D97706',
    fontSize: 10,
    fontWeight: '800',
  },
  accountSyncBadge: {
    marginTop: 4,
  },
  accountSyncText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  quotaStatsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(249, 250, 251, 0.85)',
    borderRadius: 14,
    paddingVertical: 12,
    marginTop: 16,
    borderWidth: 1,
    borderColor: 'rgba(243, 244, 246, 0.9)',
  },
  quotaItem: {
    flex: 1,
    alignItems: 'center',
  },
  quotaDiv: {
    width: 1,
    backgroundColor: 'rgba(229, 231, 235, 0.8)',
  },
  quotaVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#1F2937',
  },
  quotaLbl: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
  },
  logoutBtn: {
    marginTop: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(254, 226, 226, 0.7)',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(252, 165, 165, 0.6)',
  },
  logoutBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  // 未登入卡片
  glassLoginCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.98)',
    shadowColor: '#EC4899',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  loginCardLogo: {
    width: 64,
    height: 64,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#EC4899',
    marginBottom: 12,
  },
  loginCardTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#1F2937',
    marginBottom: 6,
  },
  loginCardSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
    paddingHorizontal: 8,
  },
  googleLoginBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 16,
    width: '100%',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  googleLoginBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1F2937',
  },
  demoLoginBtn: {
    marginTop: 12,
    paddingVertical: 8,
  },
  demoLoginBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EC4899',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  settingLabel: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '600',
  },
  settingStatusGreen: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  settingStatusBlue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
  settingStatusGray: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  footerNote: {
    alignItems: 'center',
    marginTop: 18,
    paddingBottom: 8,
  },
  footerNoteText: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  footerSubText: {
    fontSize: 10,
    color: '#D1D5DB',
    marginTop: 2,
  },
  // 底部動態晶透導航 (Specular Glass Tab Bar)
  glassBottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(255, 255, 255, 0.85)',
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    shadowColor: '#EC4899',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
  },
  navItem: {
    alignItems: 'center',
  },
  navIcon: {
    fontSize: 22,
    opacity: 0.5,
  },
  navIconActive: {
    opacity: 1,
  },
  navLabel: {
    fontSize: 10,
    color: '#9CA3AF',
    marginTop: 2,
    fontWeight: '600',
  },
  navLabelActive: {
    color: '#EC4899',
    fontWeight: '800',
  },
  // 彈窗
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalGlassContent: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 24,
    borderTopWidth: 2,
    borderTopColor: 'rgba(255, 255, 255, 0.95)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#1F2937',
  },
  modalCloseText: {
    fontSize: 18,
    color: '#9CA3AF',
    fontWeight: 'bold',
  },
  modalSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: 'rgba(243, 244, 246, 0.85)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  submitBtn: {
    backgroundColor: '#EC4899',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#EC4899',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  submitBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
});
