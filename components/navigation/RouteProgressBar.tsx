import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface RouteProgressBarProps {
  /** 0 (剛出發) 到 1 (已抵達) */
  progressRatio: number;
  remainingTrafficSignalCount: number;
  onPress?: () => void;
}

/**
 * 高德風格右側垂直路線進度條（顯示行程進度、剩餘路線、紅綠燈提示點與終點；點擊可切換總覽）
 */
export const RouteProgressBar: React.FC<RouteProgressBarProps> = React.memo(
  ({ progressRatio, remainingTrafficSignalCount, onPress }) => {
    const clamped = Math.max(0, Math.min(1, progressRatio));
    const remainingPct = Math.round((1 - clamped) * 100);
    const cursorBottomPct = Math.round(clamped * 86);

    return (
      <TouchableOpacity
        style={s.container}
        onPress={onPress}
        activeOpacity={onPress ? 0.78 : 1}
        disabled={!onPress}
        accessibilityLabel="路線進度總覽"
      >
        {/* 終點旗幟 */}
        <View style={s.destDot}>
          <Ionicons name="flag" size={10} color="#FFFFFF" />
        </View>

        {/* 垂直進度軌道 */}
        <View style={s.track}>
          {/* 剩餘路段（高對比翠綠，符合高德/導航直覺） */}
          <View style={[s.remainingFill, { height: `${remainingPct}%` }]} />

          {/* 沿途紅綠燈示意點（僅在有可靠號誌數量時顯示） */}
          {remainingTrafficSignalCount > 0 && remainingPct > 25 && (
            <View style={[s.signalTick, { top: '34%' }]} />
          )}
          {remainingTrafficSignalCount > 2 && remainingPct > 50 && (
            <View style={[s.signalTick, { top: '62%' }]} />
          )}
        </View>

        {/* 目前車輛進度游標（隨進度自下而上移動） */}
        <View style={[s.cursorWrap, { bottom: `${cursorBottomPct}%` }]}>
          <Ionicons name="navigate" size={11} color="#EC4899" />
        </View>

        <Text style={s.label}>剩餘</Text>
      </TouchableOpacity>
    );
  }
);

const s = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 10,
    top: 195,
    width: 28,
    height: 210,
    alignItems: 'center',
    zIndex: 18,
  },
  destDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#DB2777',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 3,
  },
  track: {
    flex: 1,
    width: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(100, 116, 139, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    overflow: 'hidden',
    justifyContent: 'flex-start',
  },
  remainingFill: {
    width: '100%',
    backgroundColor: '#22C55E',
  },
  signalTick: {
    position: 'absolute',
    left: 1,
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#FACC15',
  },
  cursorWrap: {
    position: 'absolute',
    bottom: 14,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#EC4899',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  label: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: '800',
    color: '#F8FAFC',
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
