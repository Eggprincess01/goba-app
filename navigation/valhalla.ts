import { API_BASE, fetchWithTimeout } from '../services/api';
import {
  Coordinate,
  HdRoadsPayload,
  NavigationRoute,
  RouteManeuver,
  SearchPlace,
  TrafficSignalNode,
  TransitBusStop,
  VehicleClassId,
  YouBikeStation,
} from './types';

/**
 * 解碼 Valhalla 6 位精度 Polyline，回傳 GeoJSON / MapLibre 標準 [lon, lat][]
 */
export function decodePolyline6(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lon = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let b = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlon = result & 1 ? ~(result >> 1) : result >> 1;
    lon += dlon;

    coords.push([Number((lon / 1e6).toFixed(6)), Number((lat / 1e6).toFixed(6))]);
  }
  return coords;
}

export function mapRawPlaceToSearchPlace(p: any): SearchPlace {
  const pid = String(p.place_id || p.id || `${p.lat}-${p.lon}`);
  return {
    id: pid,
    placeId: pid,
    name: String(p.name || '未知地點'),
    aliases: Array.isArray(p.aliases) ? p.aliases : [],
    brand: p.brand ? String(p.brand) : null,
    address: String(p.address || '台灣'),
    city: p.city ? String(p.city) : null,
    district: p.district ? String(p.district) : null,
    lat: Number(p.lat),
    lon: Number(p.lon),
    navLat: typeof p.nav_lat === 'number' ? Number(p.nav_lat) : Number(p.lat),
    navLon: typeof p.nav_lon === 'number' ? Number(p.nav_lon) : Number(p.lon),
    fuzzyMatch: Boolean(p.fuzzy_match),
    fuzzySimilarity: typeof p.fuzzy_similarity === 'number' ? Number(p.fuzzy_similarity) : undefined,
    category: p.category ? String(p.category) : undefined,
    phone: p.phone ? String(p.phone) : null,
    openingHours: p.opening_hours ? String(p.opening_hours) : null,
    services: Array.isArray(p.services) ? p.services : [],
    source: p.source ? String(p.source) : undefined,
    verificationStatus: p.verification_status || 'unverified',
    businessStatus: p.business_status || 'open',
    distanceKm: typeof p.distance_km === 'number' ? p.distance_km : undefined,
    straightDistanceKm:
      typeof p.straight_distance_km === 'number' ? p.straight_distance_km : p.distance_km,
    estimatedDriveDistanceKm:
      typeof p.estimated_drive_distance_km === 'number' ? p.estimated_drive_distance_km : undefined,
    history: Array.isArray(p.history) ? p.history : [],
  };
}

// 儲存目前進行中的搜尋 AbortController，確保新輸入時立即取消過期搜尋請求（Section 十）
let activeSearchController: AbortController | null = null;

// 客戶端記憶體快取與效能監測計數器（減少重複 API 請求，達成已快取地圖 <1s 秒開與 2D/3D 零重載切換）
const hdRoadsClientCache = new Map<string, { ts: number; data: HdRoadsPayload }>();
const trafficSignalsClientCache = new Map<string, { ts: number; data: TrafficSignalNode[] }>();
const searchClientCache = new Map<string, { ts: number; data: UnifiedSearchResponse }>();
const routeClientCache = new Map<string, { ts: number; data: NavigationRoute }>();
const youBikeClientCache = new Map<string, { ts: number; data: YouBikeResponse }>();
const transitStopsClientCache = new Map<string, { ts: number; data: TransitBusStop[] }>();
const CLIENT_CACHE_TTL_MS = 5 * 60 * 1000;
const YOUBIKE_CACHE_TTL_MS = 45 * 1000;

export interface YouBikeResponse {
  liveAvailable: boolean;
  statusMessage?: string;
  stations: YouBikeStation[];
}

export const mapApiPerfCounters = {
  apiRequests: 0,
  cacheHits: 0,
  lastHdRoadsLatencyMs: 0,
  lastSearchLatencyMs: 0,
  lastRouteTotalMs: 0,
  lastRouteValhallaMs: 0,
  lastRouteNetworkMs: 0,
};

export interface UnifiedSearchResponse {
  places: SearchPlace[];
  searchBasis: string;
  appliedRadiusKm: number | null;
  latencyMs: number;
  cached: boolean;
}

/**
 * 呼叫 GOBA 後端統一搜尋服務 GET /api/maps/search（由後端統一負責意圖辨識、排序、去重、搬遷攔截與快取）
 */
export async function searchUnifiedPlaces(
  query: string,
  options?: {
    gpsCenter?: Coordinate | null;
    mapCenter?: Coordinate | null;
    bbox?: string;
    category?: string;
    sortBy?: 'relevance' | 'distance';
    radiusKm?: number;
    limit?: number;
  }
): Promise<UnifiedSearchResponse> {
  const q = query.trim();
  if (!q) {
    return { places: [], searchBasis: '', appliedRadiusKm: null, latencyMs: 0, cached: false };
  }

  const cacheKey = `${q}|${options?.category || ''}|${options?.sortBy || ''}|${
    options?.gpsCenter ? `${options.gpsCenter.lat.toFixed(3)},${options.gpsCenter.lon.toFixed(3)}` : ''
  }|${options?.radiusKm || ''}`;
  const hit = searchClientCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < CLIENT_CACHE_TTL_MS) {
    mapApiPerfCounters.cacheHits += 1;
    mapApiPerfCounters.lastSearchLatencyMs = 1;
    return { ...hit.data, cached: true, latencyMs: 1 };
  }

  if (activeSearchController) {
    activeSearchController.abort();
  }
  const controller = new AbortController();
  activeSearchController = controller;

  const qs = new URLSearchParams({ q });
  if (options?.gpsCenter) {
    qs.set('lat', String(options.gpsCenter.lat));
    qs.set('lon', String(options.gpsCenter.lon));
  }
  if (options?.mapCenter) {
    qs.set('map_lat', String(options.mapCenter.lat));
    qs.set('map_lon', String(options.mapCenter.lon));
  }
  if (options?.bbox) qs.set('bbox', options.bbox);
  if (options?.category) qs.set('category', options.category);
  if (options?.sortBy) qs.set('sort_by', options.sortBy);
  if (options?.radiusKm) qs.set('radius_km', String(options.radiusKm));
  if (options?.limit) qs.set('limit', String(options.limit));

  const t0 = Date.now();
  mapApiPerfCounters.apiRequests += 1;
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(`${API_BASE}/api/maps/search?${qs.toString()}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`搜尋服務回應異常 (HTTP ${res.status})`);
    }
    const json = await res.json();
    const places = Array.isArray(json.places) ? json.places.map(mapRawPlaceToSearchPlace) : [];
    const elapsed = Date.now() - t0;
    mapApiPerfCounters.lastSearchLatencyMs = elapsed;
    const out: UnifiedSearchResponse = {
      places,
      searchBasis: String(json.search_basis || '目前位置'),
      appliedRadiusKm: typeof json.applied_radius_km === 'number' ? json.applied_radius_km : null,
      latencyMs: elapsed,
      cached: Boolean(json.cached),
    };
    if (searchClientCache.size > 80) searchClientCache.clear();
    searchClientCache.set(cacheKey, { ts: Date.now(), data: out });
    return out;
  } finally {
    clearTimeout(timer);
    if (activeSearchController === controller) {
      activeSearchController = null;
    }
  }
}

/**
 * 相容既有簡單呼叫介面
 */
export async function searchDestinationPlaces(
  query: string,
  bias?: Coordinate | null
): Promise<SearchPlace[]> {
  const res = await searchUnifiedPlaces(query, { gpsCenter: bias });
  return res.places;
}

/**
 * 附近類別／地圖可視範圍搜尋（GET /api/maps/nearby，支援「搜尋這個區域」）
 */
export async function fetchNearbyCategoryPlaces(params: {
  category: string;
  center: Coordinate;
  radiusKm?: number;
  bbox?: string;
}): Promise<UnifiedSearchResponse> {
  const qs = new URLSearchParams({
    category: params.category,
    lat: String(params.center.lat),
    lon: String(params.center.lon),
  });
  if (params.radiusKm) qs.set('radius_km', String(params.radiusKm));
  if (params.bbox) qs.set('bbox', params.bbox);

  const res = await fetchWithTimeout(`${API_BASE}/api/maps/nearby?${qs.toString()}`, {}, 9000);
  if (!res.ok) throw new Error('附近地點搜尋失敗，請稍後再試');
  const json = await res.json();
  return {
    places: Array.isArray(json.places) ? json.places.map(mapRawPlaceToSearchPlace) : [],
    searchBasis: String(json.search_basis || '目前地圖區域'),
    appliedRadiusKm: typeof json.applied_radius_km === 'number' ? json.applied_radius_km : null,
    latencyMs: Number(json.latency_ms || 0),
    cached: Boolean(json.cached),
  };
}

/**
 * 依穩定 GOBA Place ID 查詢完整地點詳情（GET /api/maps/place/:id）
 */
export async function fetchPlaceDetailById(
  placeId: string,
  bias?: Coordinate | null
): Promise<SearchPlace | null> {
  const qs = new URLSearchParams();
  if (bias) {
    qs.set('lat', String(bias.lat));
    qs.set('lon', String(bias.lon));
  }
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/maps/place/${encodeURIComponent(placeId)}?${qs.toString()}`,
      {},
      7000
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.place) {
      if (json.place.relocated_target) {
        return mapRawPlaceToSearchPlace(json.place.relocated_target);
      }
      return mapRawPlaceToSearchPlace(json.place);
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * 提交地點錯誤回報（POST /api/maps/feedback -> 進入待核實佇列，不直接覆蓋正式資料）
 */
export async function submitPlaceErrorFeedback(params: {
  placeId?: string;
  issueType:
    | 'address_wrong'
    | 'relocated'
    | 'closed'
    | 'name_wrong'
    | 'duplicate'
    | 'missing_place'
    | 'other';
  proposedChanges: {
    name?: string;
    address?: string;
    phone?: string;
    opening_hours?: string;
    lat?: number;
    lon?: number;
    manual_pin_confirmed?: boolean;
    note?: string;
  };
  originalSnapshot?: any;
}): Promise<{ feedback_id: number; message: string; coordinate_warning?: string | null }> {
  const res = await fetchWithTimeout(
    `${API_BASE}/api/maps/feedback`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        place_id: params.placeId,
        issue_type: params.issueType,
        proposed_changes: params.proposedChanges,
        original_snapshot: params.originalSnapshot,
      }),
    },
    9000
  );
  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    throw new Error(json?.detail || '回報送出失敗，請檢查網路連線');
  }
  return {
    feedback_id: Number(json.feedback_id || 0),
    message: String(json.message || '感謝您的回報，已送交審核佇列！'),
    coordinate_warning: json.coordinate_warning ? String(json.coordinate_warning) : null,
  };
}

export interface AddressGeocodeCandidate {
  address: string;
  lat: number;
  lon: number;
  score: number;
  addr_type?: string;
}

/**
 * 台灣門牌地址地理編碼（GET /api/maps/geocode-address），供新增／修改地點前預覽座標，絕不回傳預設假座標
 */
export async function geocodeTaiwanAddress(address: string): Promise<AddressGeocodeCandidate[]> {
  const q = address.trim();
  if (q.length < 4) return [];
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/maps/geocode-address?address=${encodeURIComponent(q)}`,
      {},
      7500
    );
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.candidates) ? json.candidates : [];
  } catch {
    return [];
  }
}

export async function fetchAdminFeedbackQueue(): Promise<any[]> {
  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/maps/admin/feedback`, {}, 8000);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json.feedbacks) ? json.feedbacks : [];
  } catch {
    return [];
  }
}

export async function reviewAdminFeedback(
  feedbackId: number,
  action: 'approve' | 'reject',
  reviewerNote = ''
): Promise<any> {
  const res = await fetchWithTimeout(
    `${API_BASE}/api/maps/admin/review`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        feedback_id: feedbackId,
        action,
        reviewer_note: reviewerNote,
      }),
    },
    9000
  );
  return await res.json();
}

/**
 * 反向地理編碼：點擊地圖任意點取得台灣地址與地標名稱
 */
export async function reverseGeocodeLocation(
  lat: number,
  lon: number
): Promise<{ name: string; address: string }> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/maps/reverse?lat=${lat}&lon=${lon}`,
      {},
      6000
    );
    if (res.ok) {
      const json = await res.json();
      if (json?.name) {
        return { name: String(json.name), address: String(json.address || '台灣') };
      }
    }
  } catch {
    // ignore
  }
  return { name: '地圖選取位置', address: `${lat.toFixed(5)}, ${lon.toFixed(5)}` };
}

/**
 * 透過 GOBA 後端（Valhalla 路線引擎）規劃多運具路線（同步傳遞 destination_place_id 確保攔截歷史搬遷舊址）
 */
export async function fetchValhallaRoute(params: {
  origin: Coordinate;
  originHeadingDeg?: number | null;
  destination: Coordinate;
  destinationPlaceId?: string;
  vehicleType: VehicleClassId;
  avoidTolls?: boolean;
  avoidHighways?: boolean;
}): Promise<NavigationRoute> {
  const originPayload: { lat: number; lon: number; heading?: number } = {
    lat: params.origin.lat,
    lon: params.origin.lon,
  };
  if (
    typeof params.originHeadingDeg === 'number' &&
    !Number.isNaN(params.originHeadingDeg) &&
    params.originHeadingDeg >= 0 &&
    params.originHeadingDeg <= 360
  ) {
    originPayload.heading = Math.round(params.originHeadingDeg) % 360;
  }

  const tReqStart = Date.now();
  const routeCacheKey =
    originPayload.heading == null
      ? `${params.origin.lat.toFixed(4)},${params.origin.lon.toFixed(4)}|${params.destination.lat.toFixed(4)},${params.destination.lon.toFixed(4)}|${params.vehicleType}|${params.avoidTolls ? 1 : 0}|${params.avoidHighways ? 1 : 0}`
      : null;

  if (routeCacheKey) {
    const cachedRoute = routeClientCache.get(routeCacheKey);
    if (cachedRoute && Date.now() - cachedRoute.ts < 120000) {
      mapApiPerfCounters.cacheHits += 1;
      mapApiPerfCounters.lastRouteTotalMs = 1;
      mapApiPerfCounters.lastRouteValhallaMs = 0;
      mapApiPerfCounters.lastRouteNetworkMs = 0;
      return {
        ...cachedRoute.data,
        timingMs: {
          valhallaMs: 0,
          signalsMs: 0,
          serverTotalMs: 0,
          networkMs: 0,
          totalMs: 1,
          cached: true,
        },
      };
    }
  }

  mapApiPerfCounters.apiRequests += 1;
  const res = await fetchWithTimeout(
    `${API_BASE}/api/maps/route`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: originPayload,
        destination: { lat: params.destination.lat, lon: params.destination.lon },
        destination_place_id: params.destinationPlaceId,
        vehicle_type: params.vehicleType,
        avoid_tolls: Boolean(params.avoidTolls),
        avoid_highways: Boolean(params.avoidHighways),
      }),
    },
    14000
  );

  const json = await res.json().catch(() => null);
  const totalClientMs = Date.now() - tReqStart;
  if (!res.ok || !json) {
    throw new Error(json?.detail || '路線規劃失敗，請檢查網路或重新選擇目的地');
  }

  const srvTiming = json.timing_ms || {};
  const valhallaMs = Number(srvTiming.valhalla_ms || 0);
  const signalsMs = Number(srvTiming.signals_ms || 0);
  const serverTotalMs = Number(srvTiming.total_ms || 0);
  const networkMs = Math.max(0, totalClientMs - serverTotalMs);
  mapApiPerfCounters.lastRouteTotalMs = totalClientMs;
  mapApiPerfCounters.lastRouteValhallaMs = valhallaMs;
  mapApiPerfCounters.lastRouteNetworkMs = networkMs;

  const maneuvers: RouteManeuver[] = Array.isArray(json.maneuvers)
    ? json.maneuvers.map((m: any, idx: number) => ({
        index: typeof m.index === 'number' ? m.index : idx,
        type: Number(m.type || 0),
        instruction: String(m.instruction || '沿路線行駛'),
        rawInstruction: m.raw_instruction ? String(m.raw_instruction) : undefined,
        streetNames: Array.isArray(m.street_names) ? m.street_names : [],
        distanceKm: Number(m.distance_km || 0),
        durationSec: Number(m.duration_sec || 0),
        beginShapeIndex: Number(m.begin_shape_index || 0),
        endShapeIndex:
          typeof m.end_shape_index === 'number'
            ? Number(m.end_shape_index)
            : Number(m.begin_shape_index || 0),
        coordinate:
          Array.isArray(m.coordinate) && m.coordinate.length >= 2
            ? [Number(m.coordinate[0]), Number(m.coordinate[1])]
            : null,
        verifiedLegalUTurn: Boolean(
          m.verified_legal_uturn || Number(m.type) === 12 || Number(m.type) === 13
        ),
        hasTrafficSignal: Boolean(m.has_traffic_signal),
        laneCount: typeof m.lane_count === 'number' ? Number(m.lane_count) : null,
        exitNumber: m.exit_number ? String(m.exit_number) : null,
        signToward: m.sign_toward ? String(m.sign_toward) : null,
      }))
    : [];

  const trafficSignals: TrafficSignalNode[] = Array.isArray(json.traffic_signals)
    ? json.traffic_signals.map((s: any, idx: number) => ({
        id: String(s.id || `route-sig-${idx}`),
        lat: Number(s.lat),
        lon: Number(s.lon),
        shapeIndex: typeof s.shape_index === 'number' ? Number(s.shape_index) : undefined,
        streetName: s.street_name ? String(s.street_name) : undefined,
      }))
    : [];

  const builtRoute: NavigationRoute = {
    engine: 'valhalla',
    vehicleType: params.vehicleType,
    transitPending: Boolean(json.transit_pending),
    headingVerified: Boolean(json.heading_verified),
    headingUnverified: Boolean(json.heading_unverified),
    warning: json.warning ? String(json.warning) : null,
    distanceKm: Number(json.distance_km || 0),
    durationSec: Number(json.duration_sec || 0),
    bbox:
      Array.isArray(json.bbox) && json.bbox.length === 4
        ? [Number(json.bbox[0]), Number(json.bbox[1]), Number(json.bbox[2]), Number(json.bbox[3])]
        : [
            Math.min(params.origin.lon, params.destination.lon),
            Math.min(params.origin.lat, params.destination.lat),
            Math.max(params.origin.lon, params.destination.lon),
            Math.max(params.origin.lat, params.destination.lat),
          ],
    coordinates: Array.isArray(json.coordinates) ? json.coordinates : [],
    maneuvers,
    trafficSignals,
    trafficSignalCount:
      typeof json.traffic_signal_count === 'number'
        ? Number(json.traffic_signal_count)
        : trafficSignals.length,
    timingMs: {
      valhallaMs,
      signalsMs,
      serverTotalMs,
      networkMs,
      totalMs: totalClientMs,
      cached: Boolean(srvTiming.cached),
    },
    fetchedAt: Date.now(),
  };

  if (routeCacheKey) {
    if (routeClientCache.size > 40) routeClientCache.clear();
    routeClientCache.set(routeCacheKey, { ts: Date.now(), data: builtRoute });
  }
  return builtRoute;
}

/**
 * 查詢地圖中心周邊的 OSM / Valhalla 紅綠燈號誌位置（GET /api/maps/traffic-signals）
 */
export async function fetchTrafficSignalsNear(
  center: Coordinate,
  radiusMeters = 850
): Promise<TrafficSignalNode[]> {
  const key = `${(Math.round(center.lat / 0.008) * 0.008).toFixed(3)},${(
    Math.round(center.lon / 0.008) * 0.008
  ).toFixed(3)},${radiusMeters}`;
  const hit = trafficSignalsClientCache.get(key);
  if (hit && Date.now() - hit.ts < CLIENT_CACHE_TTL_MS) {
    mapApiPerfCounters.cacheHits += 1;
    return hit.data;
  }
  mapApiPerfCounters.apiRequests += 1;
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/maps/traffic-signals?lat=${center.lat.toFixed(4)}&lon=${center.lon.toFixed(
        4
      )}&radius_m=${radiusMeters}`,
      {},
      6500
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (!Array.isArray(json?.signals)) return [];
    const out: TrafficSignalNode[] = json.signals.map((s: any, idx: number) => ({
      id: String(s.id || `sig-${idx}`),
      lat: Number(s.lat),
      lon: Number(s.lon),
    }));
    if (trafficSignalsClientCache.size > 60) trafficSignalsClientCache.clear();
    trafficSignalsClientCache.set(key, { ts: Date.now(), data: out });
    return out;
  } catch {
    return [];
  }
}

/**
 * 放大至路口等級（zoom >= 16.0）時取得真實 OSM 高精度道路面積、路口輪廓、中央分隔島、
 * 真實車道分隔線、雙黃線、斑馬線與停止線（GET /api/maps/hd-roads），具客戶端網格快取避免重複下載
 */
export async function fetchHdRoadsNear(center: Coordinate): Promise<HdRoadsPayload | null> {
  const key = `${(Math.round(center.lat / 0.003) * 0.003).toFixed(4)},${(
    Math.round(center.lon / 0.003) * 0.003
  ).toFixed(4)}`;
  const hit = hdRoadsClientCache.get(key);
  if (hit && Date.now() - hit.ts < CLIENT_CACHE_TTL_MS) {
    mapApiPerfCounters.cacheHits += 1;
    mapApiPerfCounters.lastHdRoadsLatencyMs = 1;
    return hit.data;
  }
  const t0 = Date.now();
  mapApiPerfCounters.apiRequests += 1;
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/maps/hd-roads?lat=${center.lat.toFixed(5)}&lon=${center.lon.toFixed(5)}`,
      {},
      8500
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.status === 'ok' && json?.layers) {
      mapApiPerfCounters.lastHdRoadsLatencyMs = Date.now() - t0;
      const payload = json as HdRoadsPayload;
      if (hdRoadsClientCache.size > 40) hdRoadsClientCache.clear();
      hdRoadsClientCache.set(key, { ts: Date.now(), data: payload });
      return payload;
    }
  } catch {
    // ignore
  }
  return null;
}

export function formatDurationZh(seconds: number): string {
  const totalMins = Math.max(1, Math.round(seconds / 60));
  if (totalMins < 60) return `${totalMins} 分鐘`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return mins > 0 ? `${hrs} 小時 ${mins} 分` : `${hrs} 小時`;
}

export function formatEtaTime(secondsFromNow: number): string {
  const arrival = new Date(Date.now() + secondsFromNow * 1000);
  return `${String(arrival.getHours()).padStart(2, '0')}:${String(arrival.getMinutes()).padStart(2, '0')}`;
}

/**
 * 查詢即時 YouBike 2.0 / 2.0E 站點資訊（GET /api/maps/youbike，絕不使用假數字）
 */
export async function fetchYouBikeNear(
  center: Coordinate,
  radiusMeters = 1500
): Promise<YouBikeResponse> {
  const key = `${(Math.round(center.lat / 0.004) * 0.004).toFixed(3)},${(
    Math.round(center.lon / 0.004) * 0.004
  ).toFixed(3)},${radiusMeters}`;
  const hit = youBikeClientCache.get(key);
  if (hit && Date.now() - hit.ts < YOUBIKE_CACHE_TTL_MS) {
    mapApiPerfCounters.cacheHits += 1;
    return hit.data;
  }
  mapApiPerfCounters.apiRequests += 1;
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/maps/youbike?lat=${center.lat.toFixed(5)}&lon=${center.lon.toFixed(
        5
      )}&radius_m=${radiusMeters}`,
      {},
      7500
    );
    if (!res.ok) {
      return { liveAvailable: false, statusMessage: '即時資訊暫時無法取得', stations: [] };
    }
    const json = await res.json();
    const stations: YouBikeStation[] = Array.isArray(json.stations)
      ? json.stations.map((s: any) => ({
          id: String(s.id || `youbike_${s.sno}`),
          sno: String(s.sno || ''),
          name: String(s.name || 'YouBike 站點'),
          shortName: String(s.short_name || s.name || 'YouBike'),
          area: String(s.area || ''),
          address: String(s.address || ''),
          lat: Number(s.lat),
          lon: Number(s.lon),
          availableBikes: typeof s.available_bikes === 'number' ? s.available_bikes : null,
          available20: typeof s.available_2_0 === 'number' ? s.available_2_0 : null,
          available20E: typeof s.available_2_0e === 'number' ? s.available_2_0e : null,
          availableReturnDocks:
            typeof s.available_return_docks === 'number' ? s.available_return_docks : null,
          totalDocks: typeof s.total_docks === 'number' ? s.total_docks : null,
          active: s.active !== false,
          updatedAt: String(s.updated_at || ''),
          source: String(s.source || '官方開放資料'),
          distanceKm: typeof s.distance_km === 'number' ? s.distance_km : undefined,
        }))
      : [];
    const out: YouBikeResponse = {
      liveAvailable: Boolean(json.live_available),
      statusMessage: json.status_message ? String(json.status_message) : undefined,
      stations,
    };
    if (youBikeClientCache.size > 30) youBikeClientCache.clear();
    youBikeClientCache.set(key, { ts: Date.now(), data: out });
    return out;
  } catch {
    return { liveAvailable: false, statusMessage: '即時資訊暫時無法取得', stations: [] };
  }
}

/**
 * 查詢可互動公車站牌（GET /api/maps/transit-stops，含獨立 place_id、方向區分與停靠路線）
 */
export async function fetchTransitStopsNear(
  center: Coordinate,
  radiusMeters = 650
): Promise<TransitBusStop[]> {
  const key = `${(Math.round(center.lat / 0.005) * 0.005).toFixed(3)},${(
    Math.round(center.lon / 0.005) * 0.005
  ).toFixed(3)},${radiusMeters}`;
  const hit = transitStopsClientCache.get(key);
  if (hit && Date.now() - hit.ts < CLIENT_CACHE_TTL_MS * 2) {
    mapApiPerfCounters.cacheHits += 1;
    return hit.data;
  }
  mapApiPerfCounters.apiRequests += 1;
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/maps/transit-stops?lat=${center.lat.toFixed(5)}&lon=${center.lon.toFixed(
        5
      )}&radius_m=${radiusMeters}`,
      {},
      7500
    );
    if (!res.ok) return [];
    const json = await res.json();
    const out: TransitBusStop[] = Array.isArray(json.stops)
      ? json.stops.map((s: any) => ({
          id: String(s.id),
          osmId: typeof s.osm_id === 'number' ? s.osm_id : undefined,
          name: String(s.name || '公車站'),
          directionLabel: String(s.direction_label || '公車站牌'),
          lat: Number(s.lat),
          lon: Number(s.lon),
          ref: s.ref ? String(s.ref) : undefined,
          routes: Array.isArray(s.routes)
            ? s.routes.map((r: any) => ({
                routeName: String(r.route_name || ''),
                direction: String(r.direction || ''),
                etaText: String(r.eta_text || '即時到站資訊暫時無法取得'),
              }))
            : [],
          distanceKm: typeof s.distance_km === 'number' ? s.distance_km : undefined,
        }))
      : [];
    if (transitStopsClientCache.size > 40) transitStopsClientCache.clear();
    transitStopsClientCache.set(key, { ts: Date.now(), data: out });
    return out;
  } catch {
    return [];
  }
}

export type ManeuverArrowKind =
  | 'start'
  | 'arrive'
  | 'straight'
  | 'left_90'
  | 'right_90'
  | 'sharp_left'
  | 'sharp_right'
  | 'keep_left'
  | 'keep_right'
  | 'ramp_left'
  | 'ramp_right'
  | 'exit_left'
  | 'exit_right'
  | 'uturn_left'
  | 'uturn_right'
  | 'roundabout';

/**
 * P0 #5：嚴格依據 Valhalla maneuver.type 決定語意箭頭類型，
 * 絕不將「靠左／靠右／匣道分流」與 90 度左右轉混為一談！
 */
export function getManeuverArrowKind(type: number): ManeuverArrowKind {
  switch (type) {
    case 1:
    case 2:
    case 3:
      return 'start';
    case 4:
    case 5:
    case 6:
      return 'arrive';
    case 9: // kSlightRight
    case 23: // kStayRight
      return 'keep_right';
    case 10: // kRight
      return 'right_90';
    case 11: // kSharpRight
      return 'sharp_right';
    case 12: // kUturnRight
      return 'uturn_right';
    case 13: // kUturnLeft
      return 'uturn_left';
    case 14: // kSharpLeft
      return 'sharp_left';
    case 15: // kLeft
      return 'left_90';
    case 16: // kSlightLeft
    case 24: // kStayLeft
      return 'keep_left';
    case 18: // kRampRight
      return 'ramp_right';
    case 19: // kRampLeft
      return 'ramp_left';
    case 20: // kExitRight
      return 'exit_right';
    case 21: // kExitLeft
      return 'exit_left';
    case 26:
    case 27:
      return 'roundabout';
    default:
      return 'straight';
  }
}

export function getManeuverIconName(type: number): string {
  const kind = getManeuverArrowKind(type);
  if (kind === 'start') return 'navigate';
  if (kind === 'arrive') return 'flag';
  if (kind === 'right_90' || kind === 'sharp_right') return 'return-up-forward';
  if (kind === 'left_90' || kind === 'sharp_left') return 'return-up-back';
  if (kind === 'keep_right' || kind === 'ramp_right' || kind === 'exit_right') return 'trending-up';
  if (kind === 'keep_left' || kind === 'ramp_left' || kind === 'exit_left') return 'git-branch';
  if (kind === 'uturn_left' || kind === 'uturn_right') return 'refresh';
  if (kind === 'roundabout') return 'sync-circle';
  return 'arrow-up';
}
