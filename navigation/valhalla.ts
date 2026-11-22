import { API_BASE, fetchWithTimeout } from '../services/api';
import {
  Coordinate,
  HdRoadsPayload,
  NavigationRoute,
  RouteManeuver,
  SearchPlace,
  TrafficSignalNode,
  VehicleClassId,
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

  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${API_BASE}/api/maps/search?${qs.toString()}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`搜尋服務回應異常 (HTTP ${res.status})`);
    }
    const json = await res.json();
    const places = Array.isArray(json.places) ? json.places.map(mapRawPlaceToSearchPlace) : [];
    return {
      places,
      searchBasis: String(json.search_basis || '目前位置'),
      appliedRadiusKm: typeof json.applied_radius_km === 'number' ? json.applied_radius_km : null,
      latencyMs: Number(json.latency_ms || 0),
      cached: Boolean(json.cached),
    };
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
    note?: string;
  };
  originalSnapshot?: any;
}): Promise<{ feedback_id: number; message: string }> {
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
  };
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
  if (!res.ok || !json) {
    throw new Error(json?.detail || '路線規劃失敗，請檢查網路或重新選擇目的地');
  }

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

  return {
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
    fetchedAt: Date.now(),
  };
}

/**
 * 查詢地圖中心周邊的 OSM / Valhalla 紅綠燈號誌位置（GET /api/maps/traffic-signals）
 */
export async function fetchTrafficSignalsNear(
  center: Coordinate,
  radiusMeters = 850
): Promise<TrafficSignalNode[]> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/maps/traffic-signals?lat=${center.lat.toFixed(4)}&lon=${center.lon.toFixed(
        4
      )}&radius_m=${radiusMeters}`,
      {},
      7500
    );
    if (!res.ok) return [];
    const json = await res.json();
    if (!Array.isArray(json?.signals)) return [];
    return json.signals.map((s: any, idx: number) => ({
      id: String(s.id || `sig-${idx}`),
      lat: Number(s.lat),
      lon: Number(s.lon),
    }));
  } catch {
    return [];
  }
}

/**
 * 放大至路口等級（zoom >= 16.0）時取得真實 OSM 高精度道路面積、路口輪廓、中央分隔島、
 * 真實車道分隔線、雙黃線、斑馬線與停止線（GET /api/maps/hd-roads）
 */
export async function fetchHdRoadsNear(center: Coordinate): Promise<HdRoadsPayload | null> {
  try {
    const res = await fetchWithTimeout(
      `${API_BASE}/api/maps/hd-roads?lat=${center.lat.toFixed(5)}&lon=${center.lon.toFixed(5)}`,
      {},
      9500
    );
    if (!res.ok) return null;
    const json = await res.json();
    if (json?.status === 'ok' && json?.layers) {
      return json as HdRoadsPayload;
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

export function getManeuverIconName(type: number): string {
  if (type === 1 || type === 2 || type === 3) return 'navigate';
  if (type === 4 || type === 5 || type === 6) return 'flag';
  if (type === 9 || type === 10 || type === 11 || type === 18 || type === 20 || type === 23) {
    return 'return-up-forward';
  }
  if (type === 14 || type === 15 || type === 16 || type === 19 || type === 21 || type === 24) {
    return 'return-up-back';
  }
  if (type === 12 || type === 13) return 'refresh';
  if (type === 26 || type === 27) return 'sync-circle';
  return 'arrow-up';
}
