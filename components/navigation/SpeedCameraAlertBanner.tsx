import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SpeedCameraNode } from '../../navigation/extras';

export interface ActiveSpeedCameraAlert {
  camera: SpeedCameraNode;
  distanceM: number;
  isOverspeed: boolean;
}

interface Props {
  alert: ActiveSpeedCameraAlert | null;
  speedKmh: number;
}

export const SpeedCameraAlertBanner: React.FC<Props> = React.memo(({ alert, speedKmh }) => {
  if (!alert) return null;
  const { camera, distanceM, isOverspeed } = alert;
  const limit = camera.speed_limit_kmh;
  const typeLabel =
    camera.camera_type === 'section'
      ? '區間測速'
      : camera.camera_type === 'tech_enforcement'
      ? '科技執法'
      : '固定測速';

  return (
    <View
      style={[
        s.card,
        isOverspeed ? s.cardOverspeed : s.cardNormal,
      ]}
    >
      <View style={s.left}>
        <View style={[s.camBadge, isOverspeed && { backgroundColor: '#DC2626' }]}>
          <Ionicons name="camera" size={18} color="#FFFFFF" />
        </View>
        <View style={{ flex: 1 }}>
          <View style={s.topRow}>
            <View style={[s.typeTag, isOverspeed && { backgroundColor: 'rgba(255,255,255,0.22)' }]}>
              <Text style={s.typeTagText}>{typeLabel}</Text>
            </View>
            <Text style={s.distText}>
              {distanceM <= 40 ? '即將通過' : `前方 ${Math.round(distanceM)} 公尺`}
            </Text>
          </View>
          <Text style={s.roadText} numberOfLines={1}>
            {camera.road_name || '測速執法路段'}
            {camera.direction_text ? ` · ${camera.direction_text}` : ''}
          </Text>
          {isOverspeed && (
            <Text style={s.overspeedText}>
              目前 {Math.round(speedKmh)} km/h 已超速，請減速！
            </Text>
          )}
        </View>
      </View>

      {typeof limit === 'number' && limit > 0 && (
        <View style={s.limitCircle}>
          <Text style={s.limitNumber}>{limit}</Text>
        </View>
      )}
    </View>
  );
});

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 2,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  cardNormal: {
    backgroundColor: 'rgba(15, 23, 42, 0.94)',
    borderColor: '#F59E0B',
  },
  cardOverspeed: {
    backgroundColor: 'rgba(153, 27, 27, 0.96)',
    borderColor: '#FCA5A5',
  },
  left: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  camBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#D97706',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeTag: {
    backgroundColor: 'rgba(245, 158, 11, 0.22)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  typeTagText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FDE68A',
  },
  distText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  roadText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#E2E8F0',
    marginTop: 2,
  },
  overspeedText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#FEF08A',
    marginTop: 2,
  },
  limitCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFFFFF',
    borderWidth: 4,
    borderColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
  },
  limitNumber: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
});
