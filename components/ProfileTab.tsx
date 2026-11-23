import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { styles } from '../styles/theme';
import { RegionInfo, UserProfile } from '../services/api';

interface ProfileTabProps {
  appVersion: string;
  user: UserProfile | null;
  displayName: string;
  userTasksCount: number;
  userFavorites: any[];
  isLoadingAuth: boolean;
  region: RegionInfo;
  cloudSyncStatus: string;
  isSyncingCloud: boolean;
  onGoogleLogin: () => void;
  onLogout: () => void;
  onDeleteAccount: () => void;
  onOpenAccountSettings: () => void;
  onOpenRegionModal: () => void;
  onManualCloudSync: () => void;
}

export function ProfileTab({
  appVersion,
  user,
  displayName,
  userTasksCount,
  userFavorites,
  isLoadingAuth,
  region,
  cloudSyncStatus,
  isSyncingCloud,
  onGoogleLogin,
  onLogout,
  onDeleteAccount,
  onOpenAccountSettings,
  onOpenRegionModal,
  onManualCloudSync,
}: ProfileTabProps) {
  return (
    <View style={styles.sectionStack}>
      {user ? (
        <>
          <BlurView intensity={72} tint="light" style={styles.glassCard}>
            <View style={styles.profileTopRow}>
              <Image
                source={
                  user.picture || user.avatar
                    ? { uri: user.picture || user.avatar }
                    : require('../assets/icon.png')
                }
                style={styles.profileAvatar}
              />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.profileName}>{displayName}</Text>
                  <View style={user.role === 'admin' || user.is_admin ? styles.adminBadge : styles.vipBadge}>
                    <Text style={user.role === 'admin' || user.is_admin ? styles.adminBadgeText : styles.vipBadgeText}>
                      {user.role === 'admin' || user.is_admin ? '管理員' : user.role.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.profileEmail}>{user.email}</Text>
              </View>
            </View>

            <View style={styles.quotaRow}>
              <View style={styles.quotaCol}>
                <Text style={styles.quotaVal}>{user.task_quota ?? 2}</Text>
                <Text style={styles.quotaLbl}>監控配額</Text>
              </View>
              <View style={styles.oilColDivider} />
              <View style={styles.quotaCol}>
                <Text style={[styles.quotaVal, { color: '#059669' }]}>{userTasksCount}</Text>
                <Text style={styles.quotaLbl}>進行中任務</Text>
              </View>
              <View style={styles.oilColDivider} />
              <View style={styles.quotaCol}>
                <Text style={[styles.quotaVal, { color: '#DB2777' }]}>{userFavorites.length}</Text>
                <Text style={styles.quotaLbl}>收藏車牌</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
              <Text style={styles.logoutBtnText}>登出此帳號</Text>
            </TouchableOpacity>
          </BlurView>

          {userFavorites.length > 0 && (
            <BlurView intensity={65} tint="light" style={styles.glassCard}>
              <Text style={styles.oilCardTitle}>❤️ 我的收藏車牌 ({userFavorites.length})</Text>
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
          <Image source={require('../assets/icon.png')} style={styles.loginLogo} />
          <Text style={styles.loginTitle}>登入 鍋巴 GOBA</Text>
          <Text style={styles.loginSubtitle}>
            登入 Google 帳號即可開啟車庫雲端備份，並同步您的收藏車牌、監控任務與個人化設定。
          </Text>

          <TouchableOpacity style={styles.googleBtn} onPress={onGoogleLogin} disabled={isLoadingAuth}>
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

      <BlurView intensity={65} tint="light" style={styles.glassCard}>
        <Text style={styles.oilCardTitle}>帳戶與系統設定</Text>

        <TouchableOpacity style={styles.settingItem} onPress={onOpenAccountSettings}>
          <View style={styles.settingLeft}>
            <Ionicons name="person-circle-outline" size={20} color="#DB2777" />
            <Text style={styles.settingText}>帳戶資訊設定</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 12, color: '#9CA3AF' }}>{displayName}</Text>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </View>
        </TouchableOpacity>

        <View style={styles.softDivider} />

        <TouchableOpacity style={styles.settingItem} onPress={onOpenRegionModal}>
          <View style={styles.settingLeft}>
            <Ionicons name="location-outline" size={20} color="#2563EB" />
            <Text style={styles.settingText}>地區與定位設定</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Text style={{ fontSize: 12, color: '#9CA3AF' }}>{region.name}</Text>
            <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
          </View>
        </TouchableOpacity>

        {user && (
          <>
            <View style={styles.softDivider} />
            <TouchableOpacity
              style={styles.settingItem}
              onPress={onManualCloudSync}
              disabled={isSyncingCloud}
            >
              <View style={styles.settingLeft}>
                <Ionicons name="cloud-done-outline" size={20} color="#0EA5E9" />
                <Text style={styles.settingText}>車庫雲端同步</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {isSyncingCloud ? (
                  <ActivityIndicator size="small" color="#0EA5E9" />
                ) : (
                  <Text style={{ fontSize: 11, color: '#059669', fontWeight: '700' }}>
                    {cloudSyncStatus || '立即同步'}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.softDivider} />

        <TouchableOpacity style={styles.settingItem} onPress={() => Linking.openURL('https://plate.mmlovenn.com')}>
          <View style={styles.settingLeft}>
            <Ionicons name="globe-outline" size={20} color="#059669" />
            <Text style={styles.settingText}>車牌尋找助手網頁版</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
        </TouchableOpacity>

        <View style={styles.softDivider} />

        <TouchableOpacity style={styles.settingItem} onPress={() => Linking.openURL('https://mmlovenn.com/privacy')}>
          <View style={styles.settingLeft}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#2563EB" />
            <Text style={styles.settingText}>隱私權政策</Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
        </TouchableOpacity>

        {user && (
          <>
            <View style={styles.softDivider} />
            <TouchableOpacity style={styles.settingItem} onPress={onDeleteAccount}>
              <View style={styles.settingLeft}>
                <Ionicons name="trash-outline" size={20} color="#DC2626" />
                <Text style={[styles.settingText, { color: '#DC2626' }]}>刪除帳號與雲端資料</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#DC2626" />
            </TouchableOpacity>
          </>
        )}

        <View style={styles.softDivider} />

        <TouchableOpacity
          style={styles.settingItem}
          onPress={() =>
            Alert.alert(
              '關於 鍋巴 GOBA',
              `鍋巴 GOBA v${appVersion}\n即時氣象：Open-Meteo\n官方油價：台灣中油\n即時路況：交通部高公局 1968\n即時停車：雙北停管處官方開放資料`
            )
          }
        >
          <View style={styles.settingLeft}>
            <Ionicons name="sparkles-outline" size={20} color="#8B5CF6" />
            <Text style={styles.settingText}>關於 鍋巴 GOBA</Text>
          </View>
          <Text style={{ fontSize: 12, color: '#9CA3AF' }}>v{appVersion}</Text>
        </TouchableOpacity>
      </BlurView>
    </View>
  );
}
