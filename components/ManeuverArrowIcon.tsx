import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteManeuver } from '../navigation/types';
import { getManeuverArrowKind, ManeuverArrowKind } from '../navigation/valhalla';
import { formatDistanceMetersZh } from '../navigation/navEngine';

interface ManeuverArrowIconProps {
  type: number;
  size?: number;
  color?: string;
}

/**
 * P0 #5：嚴格依據 Valhalla maneuver.type 繪製高辨識度方向箭頭：
 * - 左轉 / 右轉：明確 90 度轉向箭頭
 * - 靠左 / 靠右：明確「向左前方分岔 / 向右前方分岔」斜向箭頭（附次要淡色支線）
 * - 匝道入口 / 出口：明確主線 + 斜向分流箭頭
 * - 直行 / 迴轉 / 圓環：各自獨立專屬符號
 */
export const ManeuverArrowIcon: React.FC<ManeuverArrowIconProps> = ({
  type,
  size = 34,
  color = '#FFFFFF',
}) => {
  const kind: ManeuverArrowKind = getManeuverArrowKind(type);

  // 靠左 / 匝道靠左 / 出口靠左：向左前方 45° 分岔箭頭 + 右側淡色主線
  if (kind === 'keep_left' || kind === 'ramp_left' || kind === 'exit_left') {
    const isExit = kind === 'exit_left' || kind === 'ramp_left';
    return (
      <View style={[s.box, { width: size, height: size }]}>
        {/* 右側淡色主線（表示分岔參考） */}
        <View
          style={{
            position: 'absolute',
            right: size * 0.28,
            bottom: size * 0.14,
            width: Math.max(2.5, size * 0.09),
            height: size * 0.62,
            borderRadius: 2,
            backgroundColor: color,
            opacity: 0.32,
          }}
        />
        {/* 左前方分岔箭頭 */}
        <View style={{ transform: [{ rotate: isExit ? '-42deg' : '-32deg' }], marginRight: size * 0.12 }}>
          <Ionicons name="arrow-up" size={size * 0.84} color={color} />
        </View>
      </View>
    );
  }

  // 靠右 / 匝道靠右 / 出口靠右：向右前方 45° 分岔箭頭 + 左側淡色主線
  if (kind === 'keep_right' || kind === 'ramp_right' || kind === 'exit_right') {
    const isExit = kind === 'exit_right' || kind === 'ramp_right';
    return (
      <View style={[s.box, { width: size, height: size }]}>
        {/* 左側淡色主線（表示分岔參考） */}
        <View
          style={{
            position: 'absolute',
            left: size * 0.28,
            bottom: size * 0.14,
            width: Math.max(2.5, size * 0.09),
            height: size * 0.62,
            borderRadius: 2,
            backgroundColor: color,
            opacity: 0.32,
          }}
        />
        {/* 右前方分岔箭頭 */}
        <View style={{ transform: [{ rotate: isExit ? '42deg' : '32deg' }], marginLeft: size * 0.12 }}>
          <Ionicons name="arrow-up" size={size * 0.84} color={color} />
        </View>
      </View>
    );
  }

  // 90 度左轉 / 急左轉
  if (kind === 'left_90' || kind === 'sharp_left') {
    return (
      <View style={[s.box, { width: size, height: size }]}>
        <Ionicons name="return-up-back" size={size * 0.9} color={color} />
      </View>
    );
  }

  // 90 度右轉 / 急右轉
  if (kind === 'right_90' || kind === 'sharp_right') {
    return (
      <View style={[s.box, { width: size, height: size }]}>
        <Ionicons name="return-up-forward" size={size * 0.9} color={color} />
      </View>
    );
  }

  // 迴轉
  if (kind === 'uturn_left' || kind === 'uturn_right') {
    return (
      <View style={[s.box, { width: size, height: size }]}>
        <Ionicons
          name="reload"
          size={size * 0.82}
          color={color}
          style={kind === 'uturn_left' ? { transform: [{ scaleX: -1 }] } : undefined}
        />
      </View>
    );
  }

  if (kind === 'roundabout') {
    return (
      <View style={[s.box, { width: size, height: size }]}>
        <Ionicons name="sync-circle" size={size * 0.88} color={color} />
      </View>
    );
  }

  if (kind === 'arrive') {
    return (
      <View style={[s.box, { width: size, height: size }]}>
        <Ionicons name="flag" size={size * 0.82} color={color} />
      </View>
    );
  }

  if (kind === 'start') {
    return (
      <View style={[s.box, { width: size, height: size }]}>
        <Ionicons name="navigate" size={size * 0.8} color={color} />
      </View>
    );
  }

  return (
    <View style={[s.box, { width: size, height: size }]}>
      <Ionicons name="arrow-up" size={size * 0.88} color={color} />
    </View>
  );
};

/**
 * 判斷是否需要觸發「複雜路口放大指引」（國道交流道、匝道、高架分岔、左右分流或具出口編號）
 */
export function isComplexJunctionManeuver(m: RouteManeuver | null | undefined, distMeters: number): boolean {
  if (!m) return false;
  const kind = getManeuverArrowKind(m.type);
  const isForkOrRamp =
    kind === 'keep_left' ||
    kind === 'keep_right' ||
    kind === 'ramp_left' ||
    kind === 'ramp_right' ||
    kind === 'exit_left' ||
    kind === 'exit_right';
  const hasInterchangeSign = Boolean(m.exitNumber || m.signToward);
  const isMultiLaneTurn =
    typeof m.laneCount === 'number' &&
    m.laneCount >= 3 &&
    (kind === 'left_90' || kind === 'right_90');

  if (hasInterchangeSign || kind === 'exit_left' || kind === 'exit_right' || kind === 'ramp_left' || kind === 'ramp_right') {
    return distMeters <= 600 && distMeters >= 15;
  }
  if (isForkOrRamp || isMultiLaneTurn) {
    return distMeters <= 300 && distMeters >= 15;
  }
  return false;
}

interface ComplexJunctionCardProps {
  maneuver: RouteManeuver;
  distanceMeters: number;
}

/**
 * P1 #6：高德風格複雜路口／交流道放大指引卡片
 * - 有真實車道數 (laneCount) 時顯示實際車道數並高亮建議車道
 * - 無可靠車道數時僅顯示分岔方向示意與目的地路牌，絕不虛構不存在車道！
 */
export const ComplexJunctionCard: React.FC<ComplexJunctionCardProps> = ({
  maneuver,
  distanceMeters,
}) => {
  const kind = getManeuverArrowKind(maneuver.type);
  const isLeftSide =
    kind === 'keep_left' || kind === 'ramp_left' || kind === 'exit_left' || kind === 'left_90';
  const isRightSide =
    kind === 'keep_right' || kind === 'ramp_right' || kind === 'exit_right' || kind === 'right_90';
  const isExit = kind === 'exit_left' || kind === 'exit_right' || kind === 'ramp_left' || kind === 'ramp_right';

  const laneCount = typeof maneuver.laneCount === 'number' && maneuver.laneCount >= 2 ? Math.min(6, maneuver.laneCount) : null;
  const roadLabel = maneuver.signToward || maneuver.streetNames?.[0] || maneuver.instruction;

  return (
    <View style={s.junctionCard}>
      {/* 上方綠色／深藍國道看板列 */}
      <View style={[s.junctionHeader, isExit ? s.junctionHeaderHighway : s.junctionHeaderUrban]}>
        <View style={s.junctionArrowBadge}>
          <ManeuverArrowIcon type={maneuver.type} size={28} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {maneuver.exitNumber ? (
              <View style={s.exitBadge}>
                <Text style={s.exitBadgeText}>出口 {maneuver.exitNumber}</Text>
              </View>
            ) : null}
            <Text style={s.junctionDistText}>{formatDistanceMetersZh(distanceMeters)}</Text>
            <Text style={s.junctionActionLabel}>
              {isExit ? (isLeftSide ? '靠左駛入匝道' : '靠右駛出匝道') : isLeftSide ? '靠左分流' : isRightSide ? '靠右分流' : '前方複雜路口'}
            </Text>
          </View>
          <Text style={s.junctionDestText} numberOfLines={1}>
            往 {roadLabel}
          </Text>
        </View>
      </View>

      {/* 下方車道與分岔結構圖（僅在具備真實車道數時繪製多車道；無車道資料則顯示簡潔分流示意） */}
      <View style={s.junctionDiagram}>
        {laneCount ? (
          <View style={s.laneRow}>
            {Array.from({ length: laneCount }).map((_, idx) => {
              const isRecommended = isLeftSide
                ? idx === 0
                : isRightSide
                ? idx === laneCount - 1
                : idx > 0 && idx < laneCount - 1;
              return (
                <View
                  key={idx}
                  style={[
                    s.laneSlot,
                    isRecommended && s.laneSlotActive,
                    idx < laneCount - 1 && s.laneSlotDivider,
                  ]}
                >
                  <ManeuverArrowIcon
                    type={isRecommended ? maneuver.type : 8}
                    size={22}
                    color={isRecommended ? '#34D399' : 'rgba(255,255,255,0.38)'}
                  />
                  <Text style={[s.laneLabel, isRecommended && s.laneLabelActive]}>
                    {isRecommended ? '建議' : '直行'}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <View style={s.simpleForkRow}>
            <View style={[s.forkBranch, isLeftSide && s.forkBranchActive]}>
              <ManeuverArrowIcon
                type={isLeftSide ? maneuver.type : 8}
                size={24}
                color={isLeftSide ? '#34D399' : 'rgba(255,255,255,0.45)'}
              />
              <Text style={[s.forkText, isLeftSide && s.forkTextActive]}>
                {isLeftSide ? '依此方向行駛' : '主線方向'}
              </Text>
            </View>
            <View style={s.forkDivider} />
            <View style={[s.forkBranch, isRightSide && s.forkBranchActive]}>
              <ManeuverArrowIcon
                type={isRightSide ? maneuver.type : 8}
                size={24}
                color={isRightSide ? '#34D399' : 'rgba(255,255,255,0.45)'}
              />
              <Text style={[s.forkText, isRightSide && s.forkTextActive]}>
                {isRightSide ? '依此方向行駛' : '主線方向'}
              </Text>
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  box: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  junctionCard: {
    marginTop: 8,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: 'rgba(52, 211, 153, 0.55)',
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 8,
  },
  junctionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 10,
  },
  junctionHeaderHighway: {
    backgroundColor: '#065F46',
  },
  junctionHeaderUrban: {
    backgroundColor: '#1D4ED8',
  },
  junctionArrowBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  exitBadge: {
    backgroundColor: '#FACC15',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 5,
  },
  exitBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#1E293B',
  },
  junctionDistText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  junctionActionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
  },
  junctionDestText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ECFDF5',
    marginTop: 2,
  },
  junctionDiagram: {
    backgroundColor: '#0F172A',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  laneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  laneSlot: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
    borderRadius: 8,
  },
  laneSlotActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
  },
  laneSlotDivider: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.18)',
  },
  laneLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 2,
    fontWeight: '600',
  },
  laneLabelActive: {
    color: '#34D399',
    fontWeight: '800',
  },
  simpleForkRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  forkBranch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 5,
    borderRadius: 8,
  },
  forkBranchActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.22)',
  },
  forkDivider: {
    width: 1,
    height: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 6,
  },
  forkText: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '600',
  },
  forkTextActive: {
    color: '#34D399',
    fontWeight: '800',
  },
});
