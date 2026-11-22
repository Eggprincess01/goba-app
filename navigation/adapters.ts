import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import * as TaskManager from 'expo-task-manager';
import { BackgroundLocationAdapter, GpsSnapshot, VoiceGuidanceAdapter } from './types';

export const GOBA_BG_LOCATION_TASK = 'GOBA_MAPS_BG_LOCATION_TASK';

type BgLocationListener = (snapshot: GpsSnapshot) => void;
let activeBgListener: BgLocationListener | null = null;

// 必須於模組頂層註冊 TaskManager 背景定位任務
if (!TaskManager.isTaskDefined(GOBA_BG_LOCATION_TASK)) {
  TaskManager.defineTask(GOBA_BG_LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    const locations = (data as { locations?: Location.LocationObject[] }).locations;
    if (!Array.isArray(locations) || locations.length === 0) return;
    const latest = locations[locations.length - 1];
    if (latest && activeBgListener) {
      activeBgListener({
        lat: latest.coords.latitude,
        lon: latest.coords.longitude,
        accuracyMeters: latest.coords.accuracy ?? null,
        headingDeg: latest.coords.heading ?? null,
        speedMps: latest.coords.speed ?? null,
        timestamp: latest.timestamp,
      });
    }
  });
}

/**
 * 第二階段實作：iOS / Android 台灣繁體中文語音播報引擎（expo-speech）
 */
export function createExpoVoiceAdapter(initialEnabled = true): VoiceGuidanceAdapter {
  let enabled = initialEnabled;
  return {
    get isEnabled() {
      return enabled;
    },
    setEnabled(val: boolean) {
      enabled = val;
      if (!val) {
        Speech.stop();
      }
    },
    async speak(text: string) {
      if (!enabled || !text.trim()) return;
      try {
        Speech.stop();
        Speech.speak(text.trim(), {
          language: 'zh-TW',
          pitch: 1.0,
          rate: 1.0,
        });
      } catch {
        // ignore speech synth errors
      }
    },
    stop() {
      try {
        Speech.stop();
      } catch {
        // ignore
      }
    },
  };
}

/**
 * 第二階段實作：iOS 背景持續定位（expo-task-manager + expo-location）
 * 若使用者僅授予「使用期間」權限，會自動安全降級為前景導航不報錯。
 */
export function createExpoBackgroundLocationAdapter(
  onBackgroundLocation: BgLocationListener
): BackgroundLocationAdapter {
  let running = false;

  return {
    isSupported: Platform.OS === 'ios' || Platform.OS === 'android',
    get isRunning() {
      return running;
    },
    async start(): Promise<boolean> {
      try {
        const bgPerm = await Location.requestBackgroundPermissionsAsync();
        if (bgPerm.status !== 'granted') {
          return false;
        }
        activeBgListener = onBackgroundLocation;
        const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(GOBA_BG_LOCATION_TASK);
        if (!alreadyStarted) {
          await Location.startLocationUpdatesAsync(GOBA_BG_LOCATION_TASK, {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 1500,
            distanceInterval: 3,
            activityType: Location.ActivityType.AutomotiveNavigation,
            pausesUpdatesAutomatically: false,
            showsBackgroundLocationIndicator: true,
          });
        }
        running = true;
        return true;
      } catch {
        running = false;
        return false;
      }
    },
    async stop(): Promise<void> {
      activeBgListener = null;
      running = false;
      try {
        const started = await Location.hasStartedLocationUpdatesAsync(GOBA_BG_LOCATION_TASK);
        if (started) {
          await Location.stopLocationUpdatesAsync(GOBA_BG_LOCATION_TASK);
        }
      } catch {
        // ignore
      }
    },
  };
}
