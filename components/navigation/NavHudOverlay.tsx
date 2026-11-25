import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ComplexJunctionCard,
  isComplexJunctionManeuver,
  ManeuverArrowIcon,
} from '../ManeuverArrowIcon';
import { formatDistanceMetersZh, getHighwayCruisePrompt } from '../../navigation/navEngine';
import {
  NavCommandState,
  NavigationPhase,
  RouteManeuver,
  VoiceGuidanceMode,
} from '../../navigation/types';
import { type ActiveSpeedCameraAlert } from './SpeedCameraAlertBanner';

interface NavHudOverlayProps {
  nextManeuver: RouteManeuver | null;
  thenManeuver: RouteManeuver | null;
  fallbackFirstManeuver: RouteManeuver | null;
  distanceToNextTurnMeters: number;
  speedKmh: number;
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
  voiceEnabled: boolean;
  voiceMode?: VoiceGuidanceMode;
  isNight?: boolean;
  activeCameraAlert?: ActiveSpeedCameraAlert | null;
  onToggleVoice: () => void;
  onCycleVoiceMode?: () => void;
  onRetryOfflineReroute: () => void;
}

/**
 * V3 高德風格導航 HUD 看板：
 * - 頂部大型深色轉向提示卡片（支援國道長距巡航提示時機）
 * - 左側獨立即時車速圓徽章（km/h）
 * - 複雜路口／交流道放大指引卡片
 */
export const NavHudOverlay: React.FC<NavHudOverlayProps> = React.memo(
  ({
    nextManeuver,
    thenManeuver,
    fallbackFirstManeuver,
    distanceToNextTurnMeters,
    speedKmh,
    phase,
    commandState,
    headingUnverified,
    gpsSignalLost,
    gpsWeakSignal,
    gpsAccuracyMeters,
    rerouteOfflinePending,
    isSimulating,
    bgLocationActive,
    voiceEnabled,
    voiceMode,
    isNight = false,
    activeCameraAlert = null,
    onToggleVoice,
    onCycleVoiceMode,
    onRetryOfflineReroute,
  }) => {
    const activeManeuver = nextManeuver ?? fallbackFirstManeuver;
    const cruiseState = getHighwayCruisePrompt(activeManeuver, distanceToNextTurnMeters);
    const effectiveVoiceMode: VoiceGuidanceMode = voiceMode ?? (voiceEnabled ? 'detailed' : 'mute');
    const voiceModeShort = effectiveVoiceMode === 'detailed' ? '詳' : effectiveVoiceMode === 'concise' ? '簡' : '靜';
    const verifiedSpeedLimit =
      typeof activeManeuver?.speedLimitKmh === 'number' && activeManeuver.speedLimitKmh > 0
        ? activeManeuver.speedLimitKmh
        : null;
    const isOverspeed = verifiedSpeedLimit !== null && speedKmh > verifiedSpeedLimit + 8;
    const showVoiceOrWarning =
      headingUnverified || gpsSignalLost || gpsWeakSignal || rerouteOfflinePending || isSimulating || bgLocationActive || phase === 'paused';

    const pillStyle = [s.hudPill, !isNight && s.hudPillLight];
    const tagTextStyle = [s.hudTagText, !isNight && s.hudTagTextLight];

    return (
      <View style={{ gap: 8 }}>
        {/* 頂部大型轉向提示卡片（對齊高德導航結構，支援日間白/夜間黑雙色） */}
        <View style={[s.amapTopCard, !isNight && s.amapTopCardLight]}>
          <View style={s.navHudMain}>
            <View style={s.arrowContainer}>
              <ManeuverArrowIcon type={cruiseState.arrowType} size={40} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                <Text style={[s.navHudDistance, !isNight && { color: '#0F172A' }]} maxFontSizeMultiplier={1.15}>
                  {formatDistanceMetersZh(distanceToNextTurnMeters)}
                </Text>
                <Text style={[s.navHudRoadName, !isNight && { color: '#1E293B' }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                  {cruiseState.targetRoadName}
                </Text>
              </View>
              <Text style={[s.navHudInstruction, !isNight && { color: '#475569' }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {cruiseState.headline}
              </Text>
            </View>

            <TouchableOpacity
              style={[s.voiceQuickBtn, !isNight && { backgroundColor: 'rgba(236, 72, 153, 0.12)' }]}
              onPress={onCycleVoiceMode ?? onToggleVoice}
              activeOpacity={0.75}
              accessibilityLabel="切換語音播報模式"
            >
              <Ionicons
                name={
                  effectiveVoiceMode === 'mute'
                    ? 'volume-mute'
                    : effectiveVoiceMode === 'concise'
                    ? 'volume-medium'
                    : 'volume-high'
                }
                size={17}
                color={effectiveVoiceMode === 'mute' ? '#94A3B8' : isNight ? '#F9A8D4' : '#DB2777'}
              />
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: '800',
                  color: effectiveVoiceMode === 'mute' ? '#94A3B8' : isNight ? '#F9A8D4' : '#DB2777',
                  marginTop: -2,
                }}
              >
                {voiceModeShort}
              </Text>
            </TouchableOpacity>
          </View>

          {phase === 'off_route_recalculating' ? (
            <View style={s.rerouteStrip}>
              <ActivityIndicator size="small" color="#FEF3C7" />
              <Text style={s.rerouteStripText} maxFontSizeMultiplier={1.2}>
                已偏離路線，Valhalla 正在重新規劃...
              </Text>
            </View>
          ) : !cruiseState.isCruise && thenManeuver ? (
            <View style={[s.thenStrip, !isNight && { backgroundColor: 'rgba(241, 245, 249, 0.92)' }]}>
              <Text style={[s.thenLabel, !isNight && { color: '#DB2777' }]} maxFontSizeMultiplier={1.2}>
                接著
              </Text>
              <ManeuverArrowIcon type={thenManeuver.type} size={15} color={isNight ? '#F472B6' : '#DB2777'} />
              <Text style={[s.thenText, !isNight && { color: '#334155' }]} numberOfLines={1} maxFontSizeMultiplier={1.2}>
                {thenManeuver.instruction}
              </Text>
            </View>
          ) : null}
        </View>

        {/* 複雜路口／國道交流道放大指引 */}
        {!cruiseState.isCruise &&
          nextManeuver &&
          isComplexJunctionManeuver(nextManeuver, distanceToNextTurnMeters) && (
            <ComplexJunctionCard maneuver={nextManeuver} distanceMeters={distanceToNextTurnMeters} />
          )}

        {/* 左側獨立即時車速圓徽章（有測速預警時自動切換紅框測速樣式） + 精簡測速提示 + 必要狀態提示 */}
        <View style={s.subHudRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={[
                s.speedCircleBadge,
                !isNight && s.speedCircleBadgeLight,
                activeCameraAlert && {
                  borderColor: '#DC2626',
                  borderWidth: 4,
                  backgroundColor: activeCameraAlert.isOverspeed
                    ? '#FEE2E2'
                    : isNight
                    ? 'rgba(15, 23, 42, 0.96)'
                    : '#FFFFFF',
                },
                isOverspeed && { borderColor: '#EF4444' },
              ]}
            >
              <Text
                style={[
                  s.speedValueText,
                  !isNight && { color: '#0F172A' },
                  activeCameraAlert?.isOverspeed && { color: '#DC2626' },
                  isOverspeed && { color: isNight ? '#FCA5A5' : '#DC2626' },
                ]}
              >
                {Math.max(0, Math.round(speedKmh))}
              </Text>
              <Text style={[s.speedUnitText, !isNight && { color: '#64748B' }]}>km/h</Text>
            </View>

            {activeCameraAlert && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  backgroundColor: activeCameraAlert.isOverspeed
                    ? 'rgba(220, 38, 38, 0.94)'
                    : 'rgba(15, 23, 42, 0.88)',
                  paddingHorizontal: 9,
                  paddingVertical: 5,
                  borderRadius: 14,
                  borderWidth: 1.5,
                  borderColor: activeCameraAlert.isOverspeed ? '#FCA5A5' : '#EF4444',
                }}
              >
                <Ionicons name="camera" size={12} color="#FFFFFF" />
                <Text style={{ fontSize: 11.5, fontWeight: '800', color: '#FFFFFF' }}>
                  {activeCameraAlert.camera.camera_type === 'section'
                    ? '區間'
                    : activeCameraAlert.camera.camera_type === 'tech_enforcement'
                    ? '科技'
                    : '測速'}{' '}
                  {Math.round(activeCameraAlert.distanceM)}m
                  {activeCameraAlert.camera.speed_limit_kmh
                    ? ` · 限${activeCameraAlert.camera.speed_limit_kmh}`
                    : ''}
                </Text>
              </View>
            )}
          </View>
          {verifiedSpeedLimit !== null && (
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: '#FFFFFF',
                borderWidth: 4,
                borderColor: '#DC2626',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOpacity: 0.25,
                shadowRadius: 4,
                elevation: 4,
              }}
            >
              <Text style={{ fontSize: 15, fontWeight: '900', color: '#0F172A', includeFontPadding: false }}>
                {verifiedSpeedLimit}
              </Text>
            </View>
          )}

          {showVoiceOrWarning && (
            <View style={s.hudMetaRow}>
              {headingUnverified && (
                <View style={pillStyle}>
                  <Ionicons name="warning" size={12} color="#F59E0B" />
                  <Text style={tagTextStyle}>迴轉限制資料不足，請依現場標誌行駛</Text>
                </View>
              )}
              {phase === 'paused' && (
                <View style={pillStyle}>
                  <View style={[s.statusDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={tagTextStyle}>導航已暫停</Text>
                </View>
              )}
              {gpsSignalLost && (
                <View style={pillStyle}>
                  <View style={[s.statusDot, { backgroundColor: '#EF4444' }]} />
                  <Text style={tagTextStyle}>GPS 訊號中斷，等待恢復...</Text>
                </View>
              )}
              {!gpsSignalLost && gpsWeakSignal && (
                <View style={pillStyle}>
                  <View style={[s.statusDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={tagTextStyle}>
                    GPS 精度較弱 (±{Math.round(gpsAccuracyMeters ?? 50)}m)
                  </Text>
                </View>
              )}
              {rerouteOfflinePending && (
                <TouchableOpacity style={pillStyle} onPress={onRetryOfflineReroute}>
                  <Ionicons name="refresh" size={12} color="#F59E0B" />
                  <Text style={tagTextStyle}>網路恢復後點此重算</Text>
                </TouchableOpacity>
              )}
              {isSimulating && (
                <View style={pillStyle}>
                  <View style={[s.statusDot, { backgroundColor: '#EC4899' }]} />
                  <Text style={tagTextStyle}>模擬導航 ({commandState})</Text>
                </View>
              )}
              {!isSimulating && bgLocationActive && (
                <View style={pillStyle}>
                  <View style={[s.statusDot, { backgroundColor: '#10B981' }]} />
                  <Text style={tagTextStyle}>背景導航運作中</Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    );
  }
);

const s = StyleSheet.create({
  amapTopCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 10,
    overflow: 'hidden',
  },
  amapTopCardLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: 'rgba(15, 23, 42, 0.10)',
    shadowOpacity: 0.14,
  },
  navHudMain: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  arrowContainer: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#DB2777',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navHudDistance: {
    fontSize: 30,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.6,
  },
  navHudRoadName: {
    flex: 1,
    fontSize: 18,
    fontWeight: '800',
    color: '#F8FAFC',
  },
  navHudInstruction: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CBD5E1',
    marginTop: 2,
  },
  voiceQuickBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thenStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.07)',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  thenLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#F472B6',
  },
  thenText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#E2E8F0',
  },
  rerouteStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(217, 119, 6, 0.35)',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  rerouteStripText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FEF3C7',
  },
  subHudRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  speedCircleBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(15, 23, 42, 0.90)',
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  speedCircleBadgeLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderColor: 'rgba(15, 23, 42, 0.12)',
    shadowOpacity: 0.14,
  },
  speedValueText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 24,
  },
  speedUnitText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#94A3B8',
    marginTop: 1,
  },
  hudMetaRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
    flexWrap: 'wrap',
  },
  hudPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(15, 23, 42, 0.86)',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  hudPillLight: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    borderColor: 'rgba(15, 23, 42, 0.10)',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
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
  hudTagTextLight: {
    color: '#1E293B',
  },
});
