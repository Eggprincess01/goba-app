import { Coordinate, NavigationRoute, RouteManeuver } from './types';

const EARTH_RADIUS_M = 6371000;

export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function computeBearingDeg(from: Coordinate, to: Coordinate): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const dLon = toRad(to.lon - from.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * 最短弧線角度平滑插值（避免 359° -> 0° 旋轉跳動）
 */
export function lerpAngleDeg(fromDeg: number, toDeg: number, factor: number): number {
  let diff = ((toDeg - fromDeg + 540) % 360) - 180;
  return (fromDeg + diff * Math.max(0, Math.min(1, factor)) + 360) % 360;
}

/**
 * 預先計算折線各頂點的累計距離（公尺），供高頻 20 FPS 平滑插值使用
 */
export function buildCumulativeDistances(coords: [number, number][]): number[] {
  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineMeters(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0]);
    cum.push(total);
  }
  return cum;
}

/**
 * 依指定行駛距離（公尺）於路線折線上精確線性插值，並前瞻 28 公尺計算平順車頭方向
 */
export function samplePolylineAtDistance(
  coords: [number, number][],
  cumDist: number[],
  distMeters: number,
  lookAheadMeters: number = 28
): { lat: number; lon: number; headingDeg: number; shapeIndex: number; finished: boolean } {
  const n = coords.length;
  if (n < 2) {
    const p = coords[0] || [121.5654, 25.033];
    return { lat: p[1], lon: p[0], headingDeg: 0, shapeIndex: 0, finished: true };
  }
  const totalLen = cumDist[n - 1] || 0;
  const clamped = Math.max(0, Math.min(totalLen, distMeters));

  const getPointAt = (d: number): { lat: number; lon: number; idx: number } => {
    if (d <= 0) return { lat: coords[0][1], lon: coords[0][0], idx: 0 };
    if (d >= totalLen) return { lat: coords[n - 1][1], lon: coords[n - 1][0], idx: n - 2 };
    let lo = 0;
    let hi = n - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cumDist[mid] <= d) lo = mid;
      else hi = mid;
    }
    const segLen = Math.max(0.001, cumDist[lo + 1] - cumDist[lo]);
    const t = Math.max(0, Math.min(1, (d - cumDist[lo]) / segLen));
    const lon = coords[lo][0] + t * (coords[lo + 1][0] - coords[lo][0]);
    const lat = coords[lo][1] + t * (coords[lo + 1][1] - coords[lo][1]);
    return { lat, lon, idx: lo };
  };

  const cur = getPointAt(clamped);
  const ahead = getPointAt(Math.min(totalLen, clamped + lookAheadMeters));
  const headingDeg =
    haversineMeters(cur.lat, cur.lon, ahead.lat, ahead.lon) > 1
      ? computeBearingDeg({ lat: cur.lat, lon: cur.lon }, { lat: ahead.lat, lon: ahead.lon })
      : computeBearingDeg(
          { lat: coords[cur.idx][1], lon: coords[cur.idx][0] },
          { lat: coords[cur.idx + 1][1], lon: coords[cur.idx + 1][0] }
        );

  return {
    lat: cur.lat,
    lon: cur.lon,
    headingDeg,
    shapeIndex: cur.idx,
    finished: clamped >= totalLen - 2,
  };
}

/**
 * 將路線拆分為「已行駛（灰化）」與「前方剩餘（高亮）」兩段，呈現 Google Maps 導航視覺效果
 */
export function splitRouteCoords(
  coords: [number, number][],
  snappedCoord: [number, number],
  nearestShapeIndex: number
): { passed: [number, number][]; remaining: [number, number][] } {
  if (coords.length < 2) return { passed: [], remaining: coords };
  const idx = Math.max(0, Math.min(coords.length - 2, nearestShapeIndex));
  const passed = [...coords.slice(0, idx + 1), snappedCoord];
  const remaining = [snappedCoord, ...coords.slice(idx + 1)];
  return { passed, remaining };
}

/**
 * 計算點 P 投影到線段 AB 上的最近點與距離（公尺，平面近距離近似）
 */
function projectPointOnSegment(
  pLat: number,
  pLon: number,
  aLon: number,
  aLat: number,
  bLon: number,
  bLat: number
): { lon: number; lat: number; distM: number; t: number } {
  const cosLat = Math.cos((pLat * Math.PI) / 180);
  const ax = aLon * cosLat;
  const ay = aLat;
  const bx = bLon * cosLat;
  const by = bLat;
  const px = pLon * cosLat;
  const py = pLat;

  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 1e-14) {
    t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  }
  const projLon = aLon + t * (bLon - aLon);
  const projLat = aLat + t * (bLat - aLat);
  return {
    lon: projLon,
    lat: projLat,
    distM: haversineMeters(pLat, pLon, projLat, projLon),
    t,
  };
}

/**
 * 計算路線折線上某一段 [startIdx..endIdx] 的總長度（公尺）
 */
export function computePolylineLengthMeters(
  coords: [number, number][],
  startIdx: number,
  endIdx: number
): number {
  const s = Math.max(0, startIdx);
  const e = Math.min(coords.length - 1, endIdx);
  let total = 0;
  for (let i = s; i < e; i++) {
    total += haversineMeters(coords[i][1], coords[i][0], coords[i + 1][1], coords[i + 1][0]);
  }
  return total;
}

export interface RouteProgressSnapshot {
  snappedCoord: [number, number];
  distanceToRouteMeters: number;
  nearestShapeIndex: number;
  activeManeuverIndex: number;
  nextManeuver: RouteManeuver | null;
  thenManeuver: RouteManeuver | null;
  distanceToNextTurnMeters: number;
  remainingDistanceMeters: number;
  remainingDurationSec: number;
  hasArrived: boolean;
}

/**
 * 即時導航核心：將目前 GPS 座標吸附至路線（Snap-to-Route），
 * 計算偏離距離、下一個轉彎距離、剩餘距離／時間與抵達判定。
 */
export function computeNavigationProgress(
  current: Coordinate,
  route: NavigationRoute,
  lastShapeIndex: number = 0
): RouteProgressSnapshot {
  const coords = route.coordinates;
  if (coords.length < 2) {
    return {
      snappedCoord: [current.lon, current.lat],
      distanceToRouteMeters: 0,
      nearestShapeIndex: 0,
      activeManeuverIndex: 0,
      nextManeuver: route.maneuvers[0] || null,
      thenManeuver: route.maneuvers[1] || null,
      distanceToNextTurnMeters: 0,
      remainingDistanceMeters: 0,
      remainingDurationSec: 0,
      hasArrived: false,
    };
  }

  // 優先在目前進度視窗 [-5, +45] 搜尋，避免迴轉或立體交叉路口跳回起點
  const windowStart = Math.max(0, lastShapeIndex - 5);
  const windowEnd = Math.min(coords.length - 2, lastShapeIndex + 45);

  let best = {
    segIdx: windowStart,
    lon: coords[windowStart][0],
    lat: coords[windowStart][1],
    distM: Number.POSITIVE_INFINITY,
  };

  for (let i = windowStart; i <= windowEnd; i++) {
    const p = projectPointOnSegment(
      current.lat,
      current.lon,
      coords[i][0],
      coords[i][1],
      coords[i + 1][0],
      coords[i + 1][1]
    );
    if (p.distM < best.distM) {
      best = { segIdx: i, lon: p.lon, lat: p.lat, distM: p.distM };
    }
  }

  // 若局部視窗偏離超過 120m，擴大為全線掃描（處理跳躍或剛開始導航）
  if (best.distM > 120) {
    for (let i = 0; i < coords.length - 1; i++) {
      const p = projectPointOnSegment(
        current.lat,
        current.lon,
        coords[i][0],
        coords[i][1],
        coords[i + 1][0],
        coords[i + 1][1]
      );
      if (p.distM < best.distM) {
        best = { segIdx: i, lon: p.lon, lat: p.lat, distM: p.distM };
      }
    }
  }

  const nearestShapeIndex = best.segIdx;

  // 剩餘距離（公尺）：從吸附點到下一頂點 + 後續整段折線
  const distToNextVertex = haversineMeters(
    best.lat,
    best.lon,
    coords[nearestShapeIndex + 1][1],
    coords[nearestShapeIndex + 1][0]
  );
  const remainingDistanceMeters = Math.round(
    distToNextVertex + computePolylineLengthMeters(coords, nearestShapeIndex + 1, coords.length - 1)
  );

  // 依比例估算剩餘時間
  const totalRouteMeters = Math.max(1, route.distanceKm * 1000);
  const ratio = Math.max(0, Math.min(1, remainingDistanceMeters / totalRouteMeters));
  const remainingDurationSec = Math.max(0, Math.round(route.durationSec * ratio));

  // 找出下一個尚未通過的轉彎步驟
  const maneuvers = route.maneuvers;
  let nextIdx = maneuvers.length - 1;
  for (let i = 0; i < maneuvers.length; i++) {
    // 跳過「出發」步驟（index 0），一旦開始行進就指向下一個轉彎
    if (i === 0 && maneuvers.length > 1 && nearestShapeIndex > 0) continue;
    if (maneuvers[i].beginShapeIndex > nearestShapeIndex) {
      nextIdx = i;
      break;
    }
  }

  const nextManeuver = maneuvers[nextIdx] || null;
  const thenManeuver = nextIdx + 1 < maneuvers.length ? maneuvers[nextIdx + 1] : null;

  let distanceToNextTurnMeters = remainingDistanceMeters;
  if (nextManeuver) {
    const targetIdx = Math.min(coords.length - 1, Math.max(nearestShapeIndex + 1, nextManeuver.beginShapeIndex));
    distanceToNextTurnMeters = Math.round(
      distToNextVertex + computePolylineLengthMeters(coords, nearestShapeIndex + 1, targetIdx)
    );
  }

  const destCoord = coords[coords.length - 1];
  const directDistToDest = haversineMeters(current.lat, current.lon, destCoord[1], destCoord[0]);
  const hasArrived = remainingDistanceMeters <= 35 || directDistToDest <= 30;

  return {
    snappedCoord: [best.lon, best.lat],
    distanceToRouteMeters: Math.round(best.distM),
    nearestShapeIndex,
    activeManeuverIndex: nextIdx,
    nextManeuver,
    thenManeuver,
    distanceToNextTurnMeters: Math.max(0, distanceToNextTurnMeters),
    remainingDistanceMeters,
    remainingDurationSec,
    hasArrived,
  };
}

export function formatDistanceMetersZh(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} 公里`;
  }
  if (meters >= 100) {
    const rounded = Math.round(meters / 10) * 10;
    return `${rounded} 公尺`;
  }
  const rounded = Math.max(10, Math.round(meters / 5) * 5);
  return `${rounded} 公尺`;
}

/**
 * 判斷是否達到語音播報門檻（500m / 150m / 35m），避免重複播報
 */
export function pickVoiceAnnouncement(
  maneuver: RouteManeuver | null,
  distanceMeters: number,
  spokenKeys: Set<string>
): { key: string; text: string } | null {
  if (!maneuver) return null;

  const isArrival = maneuver.type === 4 || maneuver.type === 5 || maneuver.type === 6;

  // 35 公尺內：立即動作提示
  if (distanceMeters <= 40) {
    const key = `${maneuver.index}:now`;
    if (!spokenKeys.has(key)) {
      return {
        key,
        text: isArrival ? '即將抵達目的地' : `現在，${maneuver.instruction}`,
      };
    }
    return null;
  }

  // 150 公尺前提示
  if (distanceMeters <= 170 && distanceMeters > 60) {
    const key = `${maneuver.index}:150`;
    if (!spokenKeys.has(key)) {
      return {
        key,
        text: `前方 150 公尺，${maneuver.instruction}`,
      };
    }
    return null;
  }

  // 500 公尺前預告
  if (distanceMeters <= 530 && distanceMeters > 350) {
    const key = `${maneuver.index}:500`;
    if (!spokenKeys.has(key)) {
      return {
        key,
        text: `前方 500 公尺，${maneuver.instruction}`,
      };
    }
    return null;
  }

  return null;
}
