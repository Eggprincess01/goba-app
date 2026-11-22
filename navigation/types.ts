export interface Coordinate {
  lat: number;
  lon: number;
}

export interface PlaceHistoryRecord {
  event?: string;
  old_name?: string | null;
  old_address?: string | null;
  new_name?: string | null;
  new_address?: string | null;
  verified_at?: string;
  note?: string;
}

export interface SearchPlace {
  id: string;
  placeId?: string;
  name: string;
  aliases?: string[];
  brand?: string | null;
  address: string;
  city?: string | null;
  district?: string | null;
  lat: number;
  lon: number;
  navLat?: number;
  navLon?: number;
  fuzzyMatch?: boolean;
  fuzzySimilarity?: number;
  category?: string;
  phone?: string | null;
  openingHours?: string | null;
  services?: string[];
  source?: string;
  verificationStatus?: 'verified' | 'unverified' | 'conflict_pending' | 'historical_relocated';
  businessStatus?: 'open' | 'closed_permanently' | 'relocated' | 'unknown';
  distanceKm?: number;
  straightDistanceKm?: number;
  estimatedDriveDistanceKm?: number;
  history?: PlaceHistoryRecord[];
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

export interface TrafficSignalNode {
  id: string;
  lat: number;
  lon: number;
  shapeIndex?: number;
  streetName?: string;
}

export interface HdRoadsPayload {
  status: string;
  cached?: boolean;
  latency_ms?: number;
  source?: string;
  stats?: {
    roads_total: number;
    roads_with_osm_lanes: number;
    intersections: number;
    medians: number;
    crosswalk_stripes: number;
    stop_lines: number;
    arrows: number;
    bridge_decks_3d?: number;
    bridge_piers?: number;
  };
  layers: {
    road_surfaces?: GeoJSON.FeatureCollection;
    road_asphalt?: GeoJSON.FeatureCollection;
    bridge_shadows?: GeoJSON.FeatureCollection;
    bridge_piers?: GeoJSON.FeatureCollection;
    bridge_decks_3d?: GeoJSON.FeatureCollection;
    bridge_surfaces?: GeoJSON.FeatureCollection;
    bridge_asphalt?: GeoJSON.FeatureCollection;
    bridge_edge_lines?: GeoJSON.FeatureCollection;
    bridge_lane_dividers?: GeoJSON.FeatureCollection;
    medians?: GeoJSON.FeatureCollection;
    bus_lanes?: GeoJSON.FeatureCollection;
    edge_lines?: GeoJSON.FeatureCollection;
    center_lines?: GeoJSON.FeatureCollection;
    lane_dividers?: GeoJSON.FeatureCollection;
    crosswalks?: GeoJSON.FeatureCollection;
    stop_lines?: GeoJSON.FeatureCollection;
    arrows?: GeoJSON.FeatureCollection;
  };
}

export interface YouBikeStation {
  id: string;
  sno: string;
  name: string;
  shortName: string;
  area: string;
  address: string;
  lat: number;
  lon: number;
  availableBikes: number | null;
  available20: number | null;
  available20E: number | null;
  availableReturnDocks: number | null;
  totalDocks: number | null;
  active: boolean;
  updatedAt: string;
  source: string;
  distanceKm?: number;
}

export interface TransitBusRouteInfo {
  routeName: string;
  direction: string;
  etaText: string;
}

export interface TransitBusStop {
  id: string;
  osmId?: number;
  name: string;
  directionLabel: string;
  lat: number;
  lon: number;
  ref?: string;
  routes: TransitBusRouteInfo[];
  distanceKm?: number;
}

export interface RouteManeuver {
  index: number;
  type: number;
  instruction: string;
  rawInstruction?: string;
  streetNames: string[];
  distanceKm: number;
  durationSec: number;
  beginShapeIndex: number;
  endShapeIndex?: number;
  coordinate: [number, number] | null; // [lon, lat]
  verifiedLegalUTurn?: boolean;
  hasTrafficSignal?: boolean;
  laneCount?: number | null;
  exitNumber?: string | null;
  signToward?: string | null;
}

export interface RouteTimingBreakdown {
  valhallaMs: number;
  signalsMs: number;
  serverTotalMs: number;
  networkMs: number;
  totalMs: number;
  cached: boolean;
}

export interface NavigationRoute {
  engine: 'valhalla';
  vehicleType: VehicleClassId;
  transitPending?: boolean;
  headingVerified?: boolean;
  headingUnverified?: boolean;
  warning?: string | null;
  distanceKm: number;
  durationSec: number;
  bbox: [number, number, number, number]; // [west, south, east, north]
  coordinates: [number, number][]; // [lon, lat][]
  maneuvers: RouteManeuver[];
  trafficSignals?: TrafficSignalNode[];
  trafficSignalCount?: number;
  timingMs?: RouteTimingBreakdown;
  fetchedAt: number;
  requestVersion?: number;
}

/**
 * Section 六：導航指令明確狀態機（7 大狀態）
 */
export type NavCommandState =
  | 'FOLLOWING_ROUTE'
  | 'APPROACHING_MANEUVER'
  | 'EXECUTING_MANEUVER'
  | 'OFF_ROUTE'
  | 'REROUTING'
  | 'ROUTE_RECOVERED'
  | 'ARRIVED';

export interface VoiceLogEntry {
  id: string;
  timestamp: number;
  routeVersion: number;
  maneuverIndex: number;
  stage: 'advance' | 'approach' | 'execute' | 'transition' | 'reroute' | 'system';
  commandState: NavCommandState;
  distanceMeters: number;
  speedKmh: number;
  text: string;
  canceled?: boolean;
}

export interface ReroutePerformanceEntry {
  id: string;
  timestamp: number;
  routeVersion: number;
  reason: 'lateral_off_route' | 'wrong_way' | 'missed_turn' | 'missed_uturn';
  detectionLatencyMs: number;
  apiLatencyMs: number;
  uiUpdateLatencyMs: number;
  firstManeuverText: string;
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
  rawHeadingDeg?: number | null;
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
