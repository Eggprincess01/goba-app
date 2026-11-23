import { Platform } from 'react-native';
import { Audio, InterruptionModeAndroid, InterruptionModeIOS } from 'expo-av';
import * as Location from 'expo-location';
import * as Speech from 'expo-speech';
import * as TaskManager from 'expo-task-manager';
import { BackgroundLocationAdapter, GpsSnapshot, VoiceGuidanceAdapter } from './types';
import { recordNavDiagnostic } from './diagnostics';

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
 * 導航語音播報音訊閃避（Audio Ducking）：
 * 播報時降低背景音樂（Apple Music / Spotify）音量而不中斷播放；播報結束後恢復混音模式。
 */
async function setNavAudioDuckingAsync(ducking: boolean): Promise<void> {
  try {
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: ducking,
      interruptionModeIOS: ducking
        ? InterruptionModeIOS.DuckOthers
        : InterruptionModeIOS.MixWithOthers,
      shouldDuckAndroid: true,
      interruptionModeAndroid: InterruptionModeAndroid.DuckOthers,
      playThroughEarpieceAndroid: false,
    });
  } catch {
    // 模擬器或無原生音訊裝置時略過，不影響導航主流程
  }
}

/**
 * 第二階段實作：iOS / Android 台灣繁體中文語音播報引擎（expo-speech + Audio Ducking）
 */
export function createExpoVoiceAdapter(initialEnabled = true): VoiceGuidanceAdapter {
  let enabled = initialEnabled;
  let speechRate = 1.0;
  let speakSeq = 0;

  const restoreAudio = (seq: number) => {
    if (seq === speakSeq) {
      void setNavAudioDuckingAsync(false);
    }
  };

  return {
    get isEnabled() {
      return enabled;
    },
    get rate() {
      return speechRate;
    },
    setEnabled(val: boolean) {
      enabled = val;
      if (!val) {
        speakSeq += 1;
        Speech.stop();
        void setNavAudioDuckingAsync(false);
      }
    },
    setRate(nextRate: number) {
      speechRate = Math.max(0.75, Math.min(1.35, nextRate));
    },
    async speak(text: string) {
      if (!enabled || !text.trim()) return;
      const mySeq = ++speakSeq;
      try {
        Speech.stop();
        await setNavAudioDuckingAsync(true);
        if (!enabled || mySeq !== speakSeq) {
          void setNavAudioDuckingAsync(false);
          return;
        }
        Speech.speak(text.trim(), {
          language: 'zh-TW',
          pitch: 1.0,
          rate: speechRate,
          onDone: () => restoreAudio(mySeq),
          onStopped: () => restoreAudio(mySeq),
          onError: () => {
            restoreAudio(mySeq);
            recordNavDiagnostic('speech_error', 'TTS_SPEAK_CALLBACK_ERROR');
          },
        });
      } catch {
        restoreAudio(mySeq);
        recordNavDiagnostic('speech_error', 'TTS_SPEAK_FAIL');
      }
    },
    stop() {
      speakSeq += 1;
      try {
        Speech.stop();
      } catch {
        // ignore
      }
      void setNavAudioDuckingAsync(false);
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
