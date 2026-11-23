import {
  Coordinate,
  NavCommandState,
  NavigationRoute,
  RouteManeuver,
  TrafficSignalNode,
} from './types';

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

export interface SpeedAdaptiveThresholds {
  advanceLeadMeters: number;
  approachLeadMeters: number;
  executeLeadMeters: number;
}

/**
 * Section 二.A & B：速度感知三階段預告距離計算
 * 預告距離 = 車速（m/s） × 預告秒數 + 安全緩衝距離（GPS 更新延遲 + TTS 合成播放延遲 + 路口反應緩衝）
 * 對應四段車速表：
 * - 0～30 km/h (0~8.3 m/s)：初次預告約 150～250m
 * - 30～60 km/h (8.3~16.7 m/s)：初次預告約 300～500m
 * - 60～90 km/h (16.7~25 m/s)：初次預告約 600～900m
 * - 90 km/h 以上 (>25 m/s)：初次預告約 1000～1500m
 */
export function computeSpeedAdaptiveThresholds(
  speedMps: number | null,
  maneuverType: number = 10
): SpeedAdaptiveThresholds {
  const v = Math.max(0, Math.min(40, speedMps && speedMps > 0 ? speedMps : 9.5));
  const speedKmh = v * 3.6;
  const isHighwayRamp = maneuverType >= 17 && maneuverType <= 21;
  const rampBonus = isHighwayRamp ? 1.25 : 1.0;

  let advanceLeadMeters: number;
  if (speedKmh <= 30) {
    // 0~30 km/h -> 150~250m
    advanceLeadMeters = Math.round((150 + (speedKmh / 30) * 100) * rampBonus);
  } else if (speedKmh <= 60) {
    // 30~60 km/h -> 300~500m
    advanceLeadMeters = Math.round((300 + ((speedKmh - 30) / 30) * 200) * rampBonus);
  } else if (speedKmh <= 90) {
    // 60~90 km/h -> 600~900m
    advanceLeadMeters = Math.round((600 + ((speedKmh - 60) / 30) * 300) * rampBonus);
  } else {
    // >90 km/h -> 1000~1500m
    const over90 = Math.min(1, (speedKmh - 90) / 40);
    advanceLeadMeters = Math.round((1000 + over90 * 500) * rampBonus);
  }

  // 接近階段（Approach）：車速 × 10.5 秒 + 70m 安全緩衝（市區約 140~220m，高速約 320~420m）
  const approachLeadMeters = Math.round(
    Math.max(125, Math.min(450, (v * 10.5 + 70) * rampBonus))
  );

  // 執行階段（Execute）：車速 × 5.2 秒 + 35m TTS/GPS 延遲緩衝（低速約 55m，市區 45km/h 約 100m，高速約 150m）
  const executeLeadMeters = Math.round(
    Math.max(52, Math.min(165, (v * 5.2 + 35) * (isHighwayRamp ? 1.15 : 1.0)))
  );

  return {
    advanceLeadMeters: Math.max(advanceLeadMeters, approachLeadMeters + 70),
    approachLeadMeters: Math.max(approachLeadMeters, executeLeadMeters + 45),
    executeLeadMeters,
  };
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
  routeSegmentBearingDeg: number;
  headingDeltaDeg: number;
  isWrongWay: boolean;
  isMissedManeuver: boolean;
  commandState: NavCommandState;
  thresholds: SpeedAdaptiveThresholds;
  remainingTrafficSignalCount: number;
  nextTrafficSignal: TrafficSignalNode | null;
  distanceToNextTrafficSignalMeters: number | null;
  hasArrived: boolean;
}

/**
 * Section 八 & 六：獨立於視覺平滑動畫的即時道路匹配（Heading-Aware Map Matching）與導航狀態機計算
 * - 綜合評估點到線段距離 + 線段方位角與實際車頭方向差異（懲罰逆向或垂直分支，當車輛完成轉彎後立即吸附至新道路）
 * - 嚴格保護迴轉（type 12/13）：在車頭尚未實際完成掉頭對齊迴轉後路線方向前，不得跳過迴轉直接進到下一個右轉/左轉
 */
export function computeNavigationProgress(
  current: Coordinate,
  route: NavigationRoute,
  lastShapeIndex: number = 0,
  currentHeadingDeg: number | null = null,
  currentSpeedMps: number | null = null,
  prevDistanceToNextTurnMeters: number | null = null,
  prevActiveManeuverIndex: number | null = null
): RouteProgressSnapshot {
  const coords = route.coordinates;
  const defaultThresholds = computeSpeedAdaptiveThresholds(currentSpeedMps, 10);
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
      routeSegmentBearingDeg: 0,
      headingDeltaDeg: 0,
      isWrongWay: false,
      isMissedManeuver: false,
      commandState: 'FOLLOWING_ROUTE',
      thresholds: defaultThresholds,
      remainingTrafficSignalCount: 0,
      nextTrafficSignal: null,
      distanceToNextTrafficSignalMeters: null,
      hasArrived: false,
    };
  }

  const isMovingForHeading =
    (currentSpeedMps ?? 0) >= 1.5 && currentHeadingDeg !== null && currentHeadingDeg >= 0;

  // 優先在目前進度視窗 [-4, +45] 搜尋，並加入車頭方向權重（轉過彎後新路段的方位角與車頭一致，會立即勝出原路段）
  const windowStart = Math.max(0, lastShapeIndex - 4);
  const windowEnd = Math.min(coords.length - 2, lastShapeIndex + 45);

  let best = {
    segIdx: windowStart,
    lon: coords[windowStart][0],
    lat: coords[windowStart][1],
    distM: Number.POSITIVE_INFINITY,
    score: Number.POSITIVE_INFINITY,
  };

  const evaluateSegment = (i: number) => {
    const p = projectPointOnSegment(
      current.lat,
      current.lon,
      coords[i][0],
      coords[i][1],
      coords[i + 1][0],
      coords[i + 1][1]
    );
    let headingPenaltyM = 0;
    if (isMovingForHeading && currentHeadingDeg !== null) {
      const segBearing = computeBearingDeg(
        { lat: coords[i][1], lon: coords[i][0] },
        { lat: coords[i + 1][1], lon: coords[i + 1][0] }
      );
      const diff = Math.abs(((currentHeadingDeg - segBearing + 540) % 360) - 180);
      // 當在路口轉彎時，已轉入的新路段 diff < 25°，原路段 diff ~ 90°（加 14m 虛擬懲罰），確保立即切換到新道路
      if (diff > 55 && diff <= 125) {
        headingPenaltyM = ((diff - 55) / 70) * 16;
      } else if (diff > 125) {
        headingPenaltyM = 24;
      }
    }
    const score = p.distM + headingPenaltyM;
    if (score < best.score) {
      best = { segIdx: i, lon: p.lon, lat: p.lat, distM: p.distM, score };
    }
  };

  for (let i = windowStart; i <= windowEnd; i++) {
    evaluateSegment(i);
  }

  // 若局部視窗偏離超過 90m，擴大為全線掃描
  if (best.distM > 90) {
    for (let i = 0; i < coords.length - 1; i++) {
      evaluateSegment(i);
    }
  }

  const nearestShapeIndex = best.segIdx;

  // 計算當前所處路線區段的順向方位角與車頭方向夾角
  const nextVertexIdx = Math.min(coords.length - 1, nearestShapeIndex + 1);
  const lookAheadIdx = Math.min(coords.length - 1, nearestShapeIndex + 2);
  const routeSegmentBearingDeg = computeBearingDeg(
    { lat: coords[nearestShapeIndex][1], lon: coords[nearestShapeIndex][0] },
    { lat: coords[lookAheadIdx][1], lon: coords[lookAheadIdx][0] }
  );

  let headingDeltaDeg = 0;
  let isWrongWay = false;
  if (isMovingForHeading && currentHeadingDeg !== null) {
    headingDeltaDeg = Math.round(
      Math.abs(((currentHeadingDeg - routeSegmentBearingDeg + 540) % 360) - 180)
    );
    isWrongWay = headingDeltaDeg > 110;
  }

  // 剩餘距離（公尺）：從吸附點到下一頂點 + 後續整段折線（真實路線距離，非直線距離）
  const distToNextVertex = haversineMeters(
    best.lat,
    best.lon,
    coords[nextVertexIdx][1],
    coords[nextVertexIdx][0]
  );
  const remainingDistanceMeters = Math.round(
    distToNextVertex + computePolylineLengthMeters(coords, nextVertexIdx, coords.length - 1)
  );

  const totalRouteMeters = Math.max(1, route.distanceKm * 1000);
  const ratio = Math.max(0, Math.min(1, remainingDistanceMeters / totalRouteMeters));
  const remainingDurationSec = Math.max(0, Math.round(route.durationSec * ratio));

  // 找出下一個尚未通過的轉彎步驟（含 Section 五.C & 六：迴轉完成確認鎖定機制）
  const maneuvers = route.maneuvers;
  let nextIdx = maneuvers.length - 1;
  for (let i = 0; i < maneuvers.length; i++) {
    if (i === 0 && maneuvers.length > 1) continue;
    if (maneuvers[i].beginShapeIndex > nearestShapeIndex) {
      nextIdx = i;
      break;
    }
  }

  // Section 五.C & 六：當上一個動作是迴轉（type 12/13），若車輛仍在迴轉點附近但車頭方向尚未完成掉頭（與迴轉後路段夾角 > 65°），
  // 嚴格鎖定在該迴轉動作，絕不跳過迴轉去播報迴轉後的右轉！
  if (
    prevActiveManeuverIndex !== null &&
    prevActiveManeuverIndex < nextIdx &&
    maneuvers[prevActiveManeuverIndex] &&
    (maneuvers[prevActiveManeuverIndex].type === 12 ||
      maneuvers[prevActiveManeuverIndex].type === 13)
  ) {
    const uturnM = maneuvers[prevActiveManeuverIndex];
    const uturnCoord = uturnM.coordinate;
    const distFromUTurnNode = uturnCoord
      ? haversineMeters(current.lat, current.lon, uturnCoord[1], uturnCoord[0])
      : 999;
    const postIdx = Math.min(coords.length - 1, uturnM.beginShapeIndex + 2);
    const postBearing = computeBearingDeg(
      { lat: coords[uturnM.beginShapeIndex][1], lon: coords[uturnM.beginShapeIndex][0] },
      { lat: coords[postIdx][1], lon: coords[postIdx][0] }
    );
    const alignedWithPostUTurn =
      currentHeadingDeg !== null &&
      currentHeadingDeg >= 0 &&
      Math.abs(((currentHeadingDeg - postBearing + 540) % 360) - 180) <= 65;

    if (!alignedWithPostUTurn && distFromUTurnNode <= 42) {
      nextIdx = prevActiveManeuverIndex;
    }
  }

  const nextManeuver = maneuvers[nextIdx] || null;
  const thenManeuver = nextIdx + 1 < maneuvers.length ? maneuvers[nextIdx + 1] : null;

  let distanceToNextTurnMeters = remainingDistanceMeters;
  if (nextManeuver) {
    if (nextManeuver.beginShapeIndex <= nearestShapeIndex && nextManeuver.coordinate) {
      distanceToNextTurnMeters = Math.round(
        haversineMeters(
          current.lat,
          current.lon,
          nextManeuver.coordinate[1],
          nextManeuver.coordinate[0]
        )
      );
    } else {
      const targetIdx = Math.min(
        coords.length - 1,
        Math.max(nextVertexIdx, nextManeuver.beginShapeIndex)
      );
      distanceToNextTurnMeters = Math.round(
        distToNextVertex + computePolylineLengthMeters(coords, nextVertexIdx, targetIdx)
      );
    }
  }

  // Section 二.C & 五.D：錯過路口／經過迴轉位置卻未迴轉偵測（Missed Maneuver / Missed U-Turn Detection）
  let isMissedManeuver = false;
  if (nextManeuver && nextManeuver.coordinate && isMovingForHeading && currentHeadingDeg !== null) {
    const distToNodeDirect = haversineMeters(
      current.lat,
      current.lon,
      nextManeuver.coordinate[1],
      nextManeuver.coordinate[0]
    );
    const bearingToNode = computeBearingDeg(current, {
      lat: nextManeuver.coordinate[1],
      lon: nextManeuver.coordinate[0],
    });
    const angleAwayFromNode = Math.abs(((currentHeadingDeg - bearingToNode + 540) % 360) - 180);

    // 若曾經接近路口（<= 55m），現在正背離該路口直行（夾角 > 115°）且距離開始拉遠（或橫向偏離 > 18m）
    if (
      prevActiveManeuverIndex === nextIdx &&
      prevDistanceToNextTurnMeters !== null &&
      prevDistanceToNextTurnMeters <= 55 &&
      angleAwayFromNode > 115 &&
      (distToNodeDirect > prevDistanceToNextTurnMeters + 8 || best.distM > 18)
    ) {
      isMissedManeuver = true;
    }
  }

  const destCoord = coords[coords.length - 1];
  const directDistToDest = haversineMeters(current.lat, current.lon, destCoord[1], destCoord[0]);
  const hasArrived = remainingDistanceMeters <= 35 || directDistToDest <= 30;

  const thresholds = computeSpeedAdaptiveThresholds(currentSpeedMps, nextManeuver?.type ?? 10);

  // 計算前方剩餘紅綠燈數量與下一個紅綠燈距離
  const routeSignals = route.trafficSignals || [];
  const upcomingSignals = routeSignals.filter(
    (s) => typeof s.shapeIndex === 'number' && s.shapeIndex > nearestShapeIndex
  );
  const nextTrafficSignal = upcomingSignals[0] || null;
  let distanceToNextTrafficSignalMeters: number | null = null;
  if (nextTrafficSignal && typeof nextTrafficSignal.shapeIndex === 'number') {
    const sigTargetIdx = Math.min(
      coords.length - 1,
      Math.max(nextVertexIdx, nextTrafficSignal.shapeIndex)
    );
    distanceToNextTrafficSignalMeters = Math.round(
      distToNextVertex + computePolylineLengthMeters(coords, nextVertexIdx, sigTargetIdx)
    );
  }

  let commandState: NavCommandState = 'FOLLOWING_ROUTE';
  if (hasArrived) {
    commandState = 'ARRIVED';
  } else if (best.distM > 24 || isWrongWay || isMissedManeuver) {
    commandState = 'OFF_ROUTE';
  } else if (distanceToNextTurnMeters <= thresholds.executeLeadMeters) {
    commandState = 'EXECUTING_MANEUVER';
  } else if (distanceToNextTurnMeters <= thresholds.approachLeadMeters) {
    commandState = 'APPROACHING_MANEUVER';
  }

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
    routeSegmentBearingDeg,
    headingDeltaDeg,
    isWrongWay,
    isMissedManeuver,
    commandState,
    thresholds,
    remainingTrafficSignalCount: upcomingSignals.length,
    nextTrafficSignal,
    distanceToNextTrafficSignalMeters,
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
 * 將完整指令精簡為短動作詞（供「接近」與「執行」階段使用，避免語句過長錯過第一個路口）
 */
export function getShortManeuverActionZh(maneuver: RouteManeuver): string {
  const t = maneuver.type;
  if (t === 4 || t === 5 || t === 6) return '抵達目的地';
  if (t === 12 || t === 13) return '迴轉';
  if (t === 9) return '向右微轉';
  if (t === 10) return '右轉';
  if (t === 11) return '向右急轉';
  if (t === 14) return '向左急轉';
  if (t === 15) return '左轉';
  if (t === 16) return '向左微轉';
  if (t === 17) return '直行上匝道';
  if (t === 18) return '靠右上匝道';
  if (t === 19) return '靠左上匝道';
  if (t === 20) return '靠右下交流道';
  if (t === 21) return '靠左下交流道';
  if (t === 23) return '靠右行駛';
  if (t === 24) return '靠左行駛';
  if (t === 25) return '匯入主線';
  if (t === 26 || t === 27) return maneuver.instruction;
  return maneuver.instruction;
}

export interface VoiceAnnouncementDecision {
  key: string;
  stage: 'advance' | 'approach' | 'execute' | 'transition';
  text: string;
}

/**
 * Section 二、五、七：速度感知三階段語音導航與合法迴轉／連續轉彎語音引擎
 * - 嚴禁使用太晚的「現在左轉」通用語句
 * - 第一階段（預告 Advance）：依車速 150m~1500m 提前告知，如「前方 500 公尺，左轉進入 文化二路二段。」
 * - 第二階段（接近 Approach）：依車速 125m~450m 提醒，如「前方 150 公尺，準備左轉。」或迴轉「前方 150 公尺，請準備迴轉。」（若為短距離連續轉彎則合併預告：「前方 200 公尺右轉，接著立即左轉。」）
 * - 第三階段（執行 Execute）：依車速 52m~165m 提前於路口前給出簡短明確指令，如「前方路口左轉。」或合法迴轉「前方允許迴轉處，請迴轉。」
 * - 轉向完成確認後（Transition）：當迴轉或轉彎完成、車頭進入正確方向後，立即播報下一步：「前方 310 公尺，右轉進入 文化二路二段。」
 */
export function pickVoiceAnnouncement(
  maneuver: RouteManeuver | null,
  thenManeuver: RouteManeuver | null,
  distanceMeters: number,
  speedMps: number | null,
  spokenKeys: Set<string>,
  isStepTransition: boolean = false
): VoiceAnnouncementDecision | null {
  if (!maneuver) return null;

  const isArrival = maneuver.type === 4 || maneuver.type === 5 || maneuver.type === 6;
  const isUTurn = maneuver.type === 12 || maneuver.type === 13;
  const thresholds = computeSpeedAdaptiveThresholds(speedMps, maneuver.type);
  const shortAction = getShortManeuverActionZh(maneuver);

  // 判斷是否為短距離連續轉彎（本步驟執行點與下一步驟距離 <= 90 公尺）
  const isShortChainedTurn =
    Boolean(thenManeuver) &&
    maneuver.distanceKm > 0 &&
    maneuver.distanceKm <= 0.09 &&
    thenManeuver!.type !== 4 &&
    thenManeuver!.type !== 5 &&
    thenManeuver!.type !== 6;
  const thenShortAction = thenManeuver ? getShortManeuverActionZh(thenManeuver) : '';

  // 1. 執行階段（Execute）：簡短有力，預留約 5.5 秒 + 35m 安全距離，絕不等到壓線才講，也絕不講「現在左轉」
  if (distanceMeters <= thresholds.executeLeadMeters && distanceMeters >= 8) {
    const key = `${maneuver.index}:execute`;
    if (!spokenKeys.has(key)) {
      if (isArrival) {
        return { key, stage: 'execute', text: '即將抵達目的地。' };
      }
      if (isUTurn) {
        const uturnPrefix = maneuver.verifiedLegalUTurn ? '前方允許迴轉處' : '前方路口';
        const chainSuffix =
          isShortChainedTurn && thenShortAction ? `，接著立即${thenShortAction}` : '';
        return {
          key,
          stage: 'execute',
          text: `${uturnPrefix}，請迴轉${chainSuffix}。`,
        };
      }
      const isRampOrRoundabout = maneuver.type >= 17 && maneuver.type <= 27;
      const intersectionLabel = maneuver.hasTrafficSignal ? '紅綠燈路口' : '路口';
      const execCore = isRampOrRoundabout
        ? `前方${maneuver.instruction}`
        : `前方${intersectionLabel}${shortAction}`;
      const chainSuffix =
        isShortChainedTurn && thenShortAction ? `，接著立即${thenShortAction}` : '';
      return {
        key,
        stage: 'execute',
        text: `${execCore}${chainSuffix}。`,
      };
    }
    return null;
  }

  // 2. 剛完成上一個轉彎或迴轉後（Transition）：立即告知下一個轉彎距離與路名（例如迴轉完成後立即播報「前方 310 公尺，右轉進入 文化二路二段。」）
  if (isStepTransition && distanceMeters > thresholds.executeLeadMeters + 20) {
    const transKey = `${maneuver.index}:transition`;
    if (!spokenKeys.has(transKey)) {
      const distLabel = formatDistanceMetersZh(distanceMeters);
      // 若距離已經進入 approach 區間，一併標記 approach 已播報避免數秒後重複
      if (distanceMeters <= thresholds.approachLeadMeters + 45) {
        spokenKeys.add(`${maneuver.index}:approach`);
      }
      if (distanceMeters <= thresholds.advanceLeadMeters + 60) {
        spokenKeys.add(`${maneuver.index}:advance`);
      }
      if (isUTurn) {
        return {
          key: transKey,
          stage: 'transition',
          text: `前方 ${distLabel}，請準備迴轉。`,
        };
      }
      const chainSuffix =
        isShortChainedTurn && thenShortAction ? `，接著立即${thenShortAction}` : '';
      return {
        key: transKey,
        stage: 'transition',
        text: `前方 ${distLabel}，${maneuver.instruction}${chainSuffix}。`,
      };
    }
  }

  // 3. 接近階段（Approach）：依車速動態於 115m~450m 提醒準備動作
  if (
    distanceMeters <= thresholds.approachLeadMeters &&
    distanceMeters > thresholds.executeLeadMeters
  ) {
    const key = `${maneuver.index}:approach`;
    if (!spokenKeys.has(key)) {
      const distLabel = formatDistanceMetersZh(distanceMeters);
      if (isArrival) {
        return {
          key,
          stage: 'approach',
          text: `前方 ${distLabel}，即將抵達目的地。`,
        };
      }
      if (isUTurn) {
        const chainSuffix =
          isShortChainedTurn && thenShortAction ? `，迴轉後立即${thenShortAction}` : '';
        return {
          key,
          stage: 'approach',
          text: `前方 ${distLabel}，請準備迴轉${chainSuffix}。`,
        };
      }
      if (isShortChainedTurn && thenShortAction) {
        return {
          key,
          stage: 'approach',
          text: `前方 ${distLabel}${shortAction}，接著立即${thenShortAction}。`,
        };
      }
      return {
        key,
        stage: 'approach',
        text: `前方 ${distLabel}，準備${shortAction}。`,
      };
    }
    return null;
  }

  // 4. 初次預告階段（Advance）：依車速對照表（0~30km/h: 150~250m, 30~60km/h: 300~500m, 60~90km/h: 600~900m, >90km/h: 1~1.5km）
  if (
    distanceMeters <= thresholds.advanceLeadMeters &&
    distanceMeters > thresholds.approachLeadMeters
  ) {
    const key = `${maneuver.index}:advance`;
    if (!spokenKeys.has(key)) {
      const distLabel = formatDistanceMetersZh(distanceMeters);
      if (isUTurn) {
        return {
          key,
          stage: 'advance',
          text: `前方 ${distLabel}，請準備迴轉。`,
        };
      }
      if (isShortChainedTurn && thenShortAction) {
        return {
          key,
          stage: 'advance',
          text: `前方 ${distLabel}${shortAction}，接著立即${thenShortAction}。`,
        };
      }
      return {
        key,
        stage: 'advance',
        text: `前方 ${distLabel}，${maneuver.instruction}。`,
      };
    }
    return null;
  }

  return null;
}

export interface CruiseHeadlineState {
  isCruise: boolean;
  arrowType: number;
  headline: string;
  targetRoadName: string;
}

/**
 * V3 第六節 6.1：國道／長距離巡航提示時機控制
 * 距離下一個轉彎／交流道出口 >= 2500 公尺時，不直接顯示「靠右／下交流道」誤導駕駛，
 * 而是明確顯示「沿目前道路繼續行駛 XX 公里」，待進入預告範圍後再切換為轉向／分流指引。
 */
export function getHighwayCruisePrompt(
  maneuver: RouteManeuver | null | undefined,
  distanceMeters: number
): CruiseHeadlineState {
  if (!maneuver) {
    return {
      isCruise: false,
      arrowType: 8,
      headline: '沿路線前進',
      targetRoadName: '前方道路',
    };
  }
  const roadLabel = maneuver.streetNames?.[0] || maneuver.signToward || '';
  if (distanceMeters >= 2500 && maneuver.type !== 4 && maneuver.type !== 5 && maneuver.type !== 6) {
    const isExpressway = /國道|快速|高架|省道|環東|建國|新生|洲美|台6|台7|台8/.test(roadLabel);
    return {
      isCruise: true,
      arrowType: 8, // 直行箭頭
      headline: isExpressway ? '沿國道／快速道路繼續行駛' : '沿目前道路繼續行駛',
      targetRoadName: roadLabel ? `前方 ${formatDistanceMetersZh(distanceMeters)} 後${getShortManeuverActionZh(maneuver)}` : '直行',
    };
  }
  return {
    isCruise: false,
    arrowType: maneuver.type,
    headline: maneuver.instruction || '沿路線前進',
    targetRoadName: roadLabel || maneuver.instruction || '前方路口',
  };
}
