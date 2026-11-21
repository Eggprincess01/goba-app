import { API_BASE, fetchWithTimeout } from '../services/api';
import { Coordinate, NavigationRoute, RouteManeuver, SearchPlace, VehicleClassId } from './types';
import { isVehicleProductionReady } from './vehicleRestrictions';

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

/**
 * 搜尋目的地（優先透過 GOBA 後端 /api/maps/geocode，失敗時自動備援 Photon）
 */
export async function searchDestinationPlaces(
  query: string,
  bias?: Coordinate | null
): Promise<SearchPlace[]> {
  const q = query.trim();
  if (!q) return [];

  const qs = new URLSearchParams({ q });
  if (bias) {
    qs.set('lat', String(bias.lat));
    qs.set('lon', String(bias.lon));
  }

  try {
    const res = await fetchWithTimeout(`${API_BASE}/api/maps/geocode?${qs.toString()}`, {}, 9000);
    if (res.ok) {
      const json = await res.json();
      if (Array.isArray(json.places)) {
        return json.places as SearchPlace[];
      }
    }
  } catch {
    // fallback directly to Photon below
  }

  const fallbackUrl =
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&bbox=119.3,21.8,122.1,25.4` +
    (bias ? `&lat=${bias.lat}&lon=${bias.lon}` : '');
  const res = await fetchWithTimeout(fallbackUrl, {}, 9000);
  if (!res.ok) {
    throw new Error('目的地搜尋服務暫時無法使用，請稍後再試');
  }
  const data = await res.json();
  const places: SearchPlace[] = [];
  for (const feat of Array.isArray(data.features) ? data.features : []) {
    const coords = feat?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const props = feat.properties || {};
    const name = String(props.name || props.street || '').trim();
    if (!name) continue;
    const addr = [props.city || props.county, props.district, props.street, props.housenumber]
      .filter(Boolean)
      .join('');
    places.push({
      id: String(props.osm_id || `${coords[1]}-${coords[0]}`),
      name,
      address: addr || '台灣',
      lat: Number(coords[1]),
      lon: Number(coords[0]),
      category: String(props.osm_value || 'place'),
    });
  }
  return places;
}

/**
 * 透過 GOBA 後端（Valhalla 路線引擎）規劃汽車路線
 */
export async function fetchValhallaRoute(params: {
  origin: Coordinate;
  destination: Coordinate;
  vehicleType: VehicleClassId;
  avoidTolls?: boolean;
  avoidHighways?: boolean;
}): Promise<NavigationRoute> {
  if (!isVehicleProductionReady(params.vehicleType)) {
    throw new Error('第一階段僅開放「汽車」路線規劃，機車與重機模式將於第二階段完成法規驗證後開放。');
  }

  const res = await fetchWithTimeout(
    `${API_BASE}/api/maps/route`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { lat: params.origin.lat, lon: params.origin.lon },
        destination: { lat: params.destination.lat, lon: params.destination.lon },
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
        coordinate: Array.isArray(m.coordinate) && m.coordinate.length >= 2 ? [Number(m.coordinate[0]), Number(m.coordinate[1])] : null,
      }))
    : [];

  return {
    engine: 'valhalla',
    vehicleType: params.vehicleType,
    distanceKm: Number(json.distance_km || 0),
    durationSec: Number(json.duration_sec || 0),
    bbox: Array.isArray(json.bbox) && json.bbox.length === 4
      ? [Number(json.bbox[0]), Number(json.bbox[1]), Number(json.bbox[2]), Number(json.bbox[3])]
      : [
          Math.min(params.origin.lon, params.destination.lon),
          Math.min(params.origin.lat, params.destination.lat),
          Math.max(params.origin.lon, params.destination.lon),
          Math.max(params.origin.lat, params.destination.lat),
        ],
    coordinates: Array.isArray(json.coordinates) ? json.coordinates : [],
    maneuvers,
    fetchedAt: Date.now(),
  };
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
