import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { LiquidGlassSurface } from '../LiquidGlassSurface';
import {
  ComplexJunctionCard,
  isComplexJunctionManeuver,
  ManeuverArrowIcon,
} from '../ManeuverArrowIcon';
import { formatDistanceMetersZh } from '../../navigation/navEngine';
import { NavCommandState, NavigationPhase, RouteManeuver } from '../../navigation/types';

interface NavHudOverlayProps {
  nextManeuver: RouteManeuver | null;
  thenManeuver: RouteManeuver | null;
  fallbackFirstManeuver: RouteManeuver | null;
  distanceToNextTurnMeters: number;
  phase: NavigationPhase;
  commandState: NavCommandState;
  remainingTrafficSignalCount: number | null;
  routeTrafficSignalCount: number;
  distanceToNextTrafficSignalMeters: number | null;
  headingUnverified: boolean;
  gpsSignalLost: boolean;
  gpsWeakSignal: boolean;
  gpsAccuracyMeters: number | null;
  rerouteOfflinePending: boolean;
  isSimulating: boolean;
  bgLocationActive: boolean;
  onRetryOfflineReroute: () => void;
}

/**
 * 導航頂部 HUD 看板（Turn-by-Turn 轉彎指示、複雜路口放大指引與即時狀態標籤）
 */
export const NavHudOverlay: React.FC<NavHudOverlayProps> = React.memo(
  ({
    nextManeuver,
    thenManeuver,
    fallbackFirstManeuver,
    distanceToNextTurnMeters,
    phase,
    commandState,
    remainingTrafficSignalCount,
    routeTrafficSignalCount,
    distanceToNextTrafficSignalMeters,
    headingUnverified,
    gpsSignalLost,
    gpsWeakSignal,
    gpsAccuracyMeters,
    rerouteOfflinePending,
    isSimulating,
    bgLocationActive,
    onRetryOfflineReroute,
  }) => {
    const activeManeuver = nextManeuver ?? fallbackFirstManeuver;
    const totalSigCount = remainingTrafficSignalCount ?? routeTrafficSignalCount ?? 0;

    return (
      <View style={{ gap: 6 }}>
        <LiquidGlassSurface variant="dark" borderRadius={26}>
          <View style={s.navHudMain}>
            <LinearGradient colors={['#F472B6', '#DB2777']} style={s.navHudArrowBox}>
              <ManeuverArrowIcon type={activeManeuver?.type ?? 8} size={34} color="#FFFFFF" />
            </LinearGradient>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={s.navHudDistance} maxFontSizeMultiplier={1.2}>
                  {formatDistanceMetersZh(distanceToNextTurnMeters)}
                </Text>
                {nextManeuver?.hasTrafficSignal && (
                  <View style={s.hudTrafficLightPill}>
                    <View style={s.hudMiniTrafficLight}>
                      <View style={[s.trafficSignalDotMini, { backgroundColor: '#EF4444' }]} />
                      <View style={[s.trafficSignalDotMini, { backgroundColor: '#F59E0B' }]} />
                      <View style={[s.trafficSignalDotMini, { backgroundColor: '#10B981' }]} />
                    </View>
                    <Text style={s.hudTrafficLightPillText}>紅綠燈路口</Text>
                  </View>
                )}
              </View>
              <Text style={s.navHudInstruction} numberOfLines={2} maxFontSizeMultiplier={1.25}>
                {activeManeuver?.instruction || '沿路線前進'}
              </Text>
            </View>
          </View>

          {phase === 'off_route_recalculating' ? (
            <View style={s.rerouteStrip}>
              <ActivityIndicator size="small" color="#FEF3C7" />
              <Text style={s.rerouteStripText} maxFontSizeMultiplier={1.2}>
                已偏離路線，Valhalla 正在重新規劃...
              </Text>
            </View>
          ) : thenManeuver ? (
            <View style={s.thenStrip}>
              <Text style={s.thenLabel} maxFontSizeMultiplier={1.2}>
                接著
              </Text>
              <ManeuverArrowIcon type={thenManeuver.type} size={16} color="#F9A8D4" />
              <Text style={s.thenText} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {thenManeuver.instruction}
              </Text>
            </View>
          ) : null}
        </LiquidGlassSurface>

        {nextManeuver && isComplexJunctionManeuver(nextManeuver, distanceToNextTurnMeters) && (
          <ComplexJunctionCard maneuver={nextManeuver} distanceMeters={distanceToNextTurnMeters} />
        )}

        <View style={s.hudMetaRow}>
          <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={s.hudTagInner}>
            <View
              style={[
                s.statusDot,
                {
                  backgroundColor:
                    commandState === 'OFF_ROUTE' || commandState === 'REROUTING'
                      ? '#F59E0B'
                      : commandState === 'EXECUTING_MANEUVER'
                      ? '#F472B6'
                      : commandState === 'ROUTE_RECOVERED'
                      ? '#38BDF8'
                      : '#34D399',
                },
              ]}
            />
            <Text style={s.hudTagText}>{commandState}</Text>
          </LiquidGlassSurface>

          {totalSigCount > 0 && (
            <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={s.hudTagInner}>
              <View style={s.hudMiniTrafficLight}>
                <View style={[s.trafficSignalDotMini, { backgroundColor: '#EF4444' }]} />
                <View style={[s.trafficSignalDotMini, { backgroundColor: '#F59E0B' }]} />
                <View style={[s.trafficSignalDotMini, { backgroundColor: '#10B981' }]} />
              </View>
              <Text style={s.hudTagText}>
                {typeof distanceToNextTrafficSignalMeters === 'number'
                  ? `下個紅綠燈 ${formatDistanceMetersZh(
                      distanceToNextTrafficSignalMeters
                    )} • 剩 ${remainingTrafficSignalCount ?? 0} 個`
                  : `沿途 ${routeTrafficSignalCount} 個紅綠燈`}
              </Text>
            </LiquidGlassSurface>
          )}

          {headingUnverified && (
            <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={s.hudTagInner}>
              <Ionicons name="warning" size={12} color="#FBBF24" />
              <Text style={s.hudTagText}>迴轉限制資料不足，請依現場標誌行駛</Text>
            </LiquidGlassSurface>
          )}

          {phase === 'paused' && (
            <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={s.hudTagInner}>
              <View style={[s.statusDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={s.hudTagText}>導航已暫停</Text>
            </LiquidGlassSurface>
          )}

          {gpsSignalLost && (
            <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={s.hudTagInner}>
              <View style={[s.statusDot, { backgroundColor: '#EF4444' }]} />
              <Text style={s.hudTagText}>GPS 訊號中斷，等待恢復...</Text>
            </LiquidGlassSurface>
          )}

          {!gpsSignalLost && gpsWeakSignal && (
            <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={s.hudTagInner}>
              <View style={[s.statusDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={s.hudTagText}>
                GPS 精度較弱 (±{Math.round(gpsAccuracyMeters ?? 50)}m)
              </Text>
            </LiquidGlassSurface>
          )}

          {rerouteOfflinePending && (
            <TouchableOpacity onPress={onRetryOfflineReroute}>
              <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={s.hudTagInner}>
                <Ionicons name="refresh" size={12} color="#FBBF24" />
                <Text style={s.hudTagText}>網路恢復後點此重算</Text>
              </LiquidGlassSurface>
            </TouchableOpacity>
          )}

          {isSimulating && (
            <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={s.hudTagInner}>
              <View style={[s.statusDot, { backgroundColor: '#FBBF24' }]} />
              <Text style={s.hudTagText}>模擬導航中</Text>
            </LiquidGlassSurface>
          )}

          {bgLocationActive && (
            <LiquidGlassSurface variant="dark" borderRadius={12} contentStyle={s.hudTagInner}>
              <View style={[s.statusDot, { backgroundColor: '#34D399' }]} />
              <Text style={s.hudTagText}>背景導航中</Text>
            </LiquidGlassSurface>
          )}
        </View>
      </View>
    );
  }
);

const s = StyleSheet.create({
  navHudMain: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 14,
  },
  navHudArrowBox: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navHudDistance: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  navHudInstruction: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F3F4F6',
    marginTop: 2,
  },
  hudTrafficLightPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  hudMiniTrafficLight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2.5,
    backgroundColor: '#111827',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 6,
  },
  trafficSignalDotMini: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  hudTrafficLightPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FDE68A',
  },
  thenStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  thenLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#F472B6',
  },
  thenText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#E5E7EB',
  },
  rerouteStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(217, 119, 6, 0.35)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  rerouteStripText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FEF3C7',
  },
  hudMetaRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  hudTagInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  hudTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#F9FAFB',
  },
});
