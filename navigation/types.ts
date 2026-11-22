export interface Coordinate {
  lat: number;
  lon: number;
}

export interface SearchPlace {
  id: string;
  name: string;
  address: string;
  lat: number;
  lon: number;
  category?: string;
  distanceKm?: number;
}

export type VehicleClassId =
  | 'car'
  | 'heavy_moto'
  | 'heavy_moto_red'
  | 'heavy_moto_yellow'
  | 'scooter'
  | 'bicycle'
  | 'pedestrian'
  | 'transit';

export interface RouteManeuver {
  index: number;
  type: number;
  instruction: string;
  rawInstruction?: string;
  streetNames: string[];
  distanceKm: number;
  durationSec: number;
  beginShapeIndex: number;
  coordinate: [number, number] | null; // [lon, lat]
}

export interface NavigationRoute {
  engine: 'valhalla';
  vehicleType: VehicleClassId;
  transitPending?: boolean;
  warning?: string | null;
  distanceKm: number;
  durationSec: number;
  bbox: [number, number, number, number]; // [west, south, east, north]
  coordinates: [number, number][]; // [lon, lat][]
  maneuvers: RouteManeuver[];
  fetchedAt: number;
}

export type NavigationPhase =
  | 'idle'
  | 'searching'
  | 'routing'
  | 'route_preview'
  | 'navigating'
  | 'paused'
  | 'off_route_recalculating'
  | 'arrived';

export type CameraFollowMode = 'free' | 'follow' | 'heading' | 'course';

export interface GpsSnapshot {
  lat: number;
  lon: number;
  accuracyMeters: number | null;
  headingDeg: number | null;
  speedMps: number | null;
  timestamp: number;
}

/**
 * 預留介面（第二階段實作）：語音播報引擎（預期整合 expo-speech）
 */
export interface VoiceGuidanceAdapter {
  isEnabled: boolean;
  rate: number;
  setEnabled(enabled: boolean): void;
  setRate(rate: number): void;
  speak(text: string): Promise<void>;
  stop(): void;
}

/**
 * 預留介面（第二階段實作）：偏航偵測與自動重算
 */
export interface OffRouteDetector {
  thresholdMeters: number;
  evaluateDistanceMeters(current: Coordinate, routeCoords: [number, number][]): number;
  isOffRoute(current: Coordinate, routeCoords: [number, number][]): boolean;
}

/**
 * 預留介面（第二階段實作）：背景定位服務（預期整合 expo-task-manager + expo-location）
 */
export interface BackgroundLocationAdapter {
  isSupported: boolean;
  isRunning: boolean;
  start(): Promise<boolean>;
  stop(): Promise<void>;
}
