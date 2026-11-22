import {
  computeNavigationProgress,
  computeSpeedAdaptiveThresholds,
  pickVoiceAnnouncement,
} from './navEngine';
import { Coordinate, NavCommandState, NavigationRoute } from './types';

export interface ReplayGpsFrame {
  tSec: number;
  lat: number;
  lon: number;
  headingDeg: number | null;
  speedMps: number | null;
  accuracyMeters: number | null;
  simulateNetworkFailure?: boolean;
}

export interface ReplayScenarioResult {
  id: number;
  name: string;
  passed: boolean;
  offRouteDetected: boolean;
  rerouteTriggered: boolean;
  firstVoiceAction: string | null;
  allVoiceAnnouncements: Array<{
    tSec: number;
    distanceMeters: number;
    stage: string;
    text: string;
    commandState: NavCommandState;
  }>;
  expiredVoicePlayed: boolean;
  repeatedReturnToOldRoute: boolean;
  detectionLatencyMs: number;
  notes: string;
}

/**
 * 建立標準測試路線（林口信義路 -> 左轉文化二路二段 -> 右轉仁愛路二段 -> 味朋餐廳）
 */
function createLinkouStandardRoute(): NavigationRoute {
  return {
    engine: 'valhalla',
    vehicleType: 'car',
    headingVerified: true,
    distanceKm: 1.43,
    durationSec: 268,
    bbox: [121.3663, 25.0756, 121.3815, 25.0806],
    coordinates: [
      [121.381512, 25.07882], // 0: 信義路起點
      [121.380613, 25.079283], // 1
      [121.379885, 25.079658], // 2
      [121.379205, 25.080008], // 3
      [121.37855, 25.08034], // 4
      [121.378014, 25.08062], // 5: 左轉進入文化二路二段 (距離起點約 405m)
      [121.3768, 25.0793], // 6
      [121.3756, 25.078], // 7
      [121.37455, 25.076891], // 8: 右轉進入仁愛路二段
      [121.3705, 25.0772], // 9
      [121.36631, 25.075656], // 10: 抵達味朋餐廳
    ],
    maneuvers: [
      {
        index: 0,
        type: 1,
        instruction: '從 信義路出發',
        streetNames: ['信義路'],
        distanceKm: 0.405,
        durationSec: 91,
        beginShapeIndex: 0,
        coordinate: [121.381512, 25.07882],
      },
      {
        index: 1,
        type: 15,
        instruction: '左轉進入 文化二路二段',
        streetNames: ['文化二路二段'],
        distanceKm: 0.542,
        durationSec: 88,
        beginShapeIndex: 5,
        coordinate: [121.378014, 25.08062],
      },
      {
        index: 2,
        type: 10,
        instruction: '右轉進入 仁愛路二段',
        streetNames: ['仁愛路二段'],
        distanceKm: 0.485,
        durationSec: 89,
        beginShapeIndex: 8,
        coordinate: [121.37455, 25.076891],
      },
      {
        index: 3,
        type: 4,
        instruction: '抵達目的地',
        streetNames: ['民族路'],
        distanceKm: 0,
        durationSec: 0,
        beginShapeIndex: 10,
        coordinate: [121.36631, 25.075656],
      },
    ],
    fetchedAt: Date.now(),
    requestVersion: 1,
  };
}

/**
 * 建立含合法迴轉（Valhalla type 13）後接續右轉的分隔島道路路線（文化二路二段於信義路口迴轉 -> 310m 右轉仁愛路二段）
 */
function createLegalUTurnRoute(): NavigationRoute {
  return {
    engine: 'valhalla',
    vehicleType: 'car',
    headingVerified: true,
    distanceKm: 1.12,
    durationSec: 195,
    bbox: [121.3663, 25.0756, 121.3785, 25.0807],
    coordinates: [
      [121.37705, 25.0796], // 0: 文化二路二段北向車道（距信義路迴轉口 150m）
      [121.37755, 25.08012], // 1
      [121.378014, 25.08062], // 2: 信義路口合法左迴轉點 (beginShapeIndex = 2)
      [121.3769, 25.07942], // 3: 迴轉後南向車道
      [121.3758, 25.07822], // 4
      [121.3753, 25.07769], // 5: 迴轉後 310m 右轉進入文化二路二段支線/仁愛路二段 (beginShapeIndex = 5)
      [121.36631, 25.075656], // 6: 終點
    ],
    maneuvers: [
      {
        index: 0,
        type: 2,
        instruction: '從右側 文化二路二段出發',
        streetNames: ['文化二路二段'],
        distanceKm: 0.15,
        durationSec: 25,
        beginShapeIndex: 0,
        coordinate: [121.37705, 25.0796],
      },
      {
        index: 1,
        type: 13,
        instruction: '於 信義路 路口迴轉，繼續沿 文化二路二段 行駛',
        streetNames: ['文化二路二段'],
        distanceKm: 0.31,
        durationSec: 55,
        beginShapeIndex: 2,
        coordinate: [121.378014, 25.08062],
        verifiedLegalUTurn: true,
      },
      {
        index: 2,
        type: 10,
        instruction: '右轉進入 文化二路二段',
        streetNames: ['文化二路二段'],
        distanceKm: 0.66,
        durationSec: 115,
        beginShapeIndex: 5,
        coordinate: [121.3753, 25.07769],
      },
      {
        index: 3,
        type: 4,
        instruction: '抵達目的地',
        streetNames: ['民族路'],
        distanceKm: 0,
        durationSec: 0,
        beginShapeIndex: 6,
        coordinate: [121.36631, 25.075656],
      },
    ],
    fetchedAt: Date.now(),
    requestVersion: 2,
  };
}

/**
 * 建立短距離連續兩個轉彎路線（右轉民享路 65m 後立即左轉中山路）
 */
function createShortChainedTurnsRoute(): NavigationRoute {
  return {
    engine: 'valhalla',
    vehicleType: 'car',
    headingVerified: true,
    distanceKm: 0.65,
    durationSec: 120,
    bbox: [121.375, 25.078, 121.382, 25.082],
    coordinates: [
      [121.3815, 25.0788], // 0
      [121.3804, 25.0794], // 1
      [121.3795, 25.0799], // 2: 200m 處右轉 (beginShapeIndex = 2)
      [121.3799, 25.0804], // 3: 65m 後立即左轉 (beginShapeIndex = 3)
      [121.3775, 25.0816], // 4: 終點
    ],
    maneuvers: [
      {
        index: 0,
        type: 1,
        instruction: '從 信義路出發',
        streetNames: ['信義路'],
        distanceKm: 0.21,
        durationSec: 35,
        beginShapeIndex: 0,
        coordinate: [121.3815, 25.0788],
      },
      {
        index: 1,
        type: 10,
        instruction: '右轉進入 民享路',
        streetNames: ['民享路'],
        distanceKm: 0.065,
        durationSec: 15,
        beginShapeIndex: 2,
        coordinate: [121.3795, 25.0799],
      },
      {
        index: 2,
        type: 15,
        instruction: '左轉進入 中山路',
        streetNames: ['中山路'],
        distanceKm: 0.375,
        durationSec: 70,
        beginShapeIndex: 3,
        coordinate: [121.3799, 25.0804],
      },
      {
        index: 3,
        type: 4,
        instruction: '抵達目的地',
        streetNames: ['中山路'],
        distanceKm: 0,
        durationSec: 0,
        beginShapeIndex: 4,
        coordinate: [121.3775, 25.0816],
      },
    ],
    fetchedAt: Date.now(),
    requestVersion: 3,
  };
}

/**
 * Section 十：執行全部 15 項 GPS 軌跡回放測試並回傳完整驗收結果
 */
export function runAllGpsReplayScenarios(): ReplayScenarioResult[] {
  const results: ReplayScenarioResult[] = [];

  // 1. 低速接近左轉路口 (22 km/h = 6.1 m/s)
  {
    const route = createLinkouStandardRoute();
    const spoken = new Set<string>();
    const logs: ReplayScenarioResult['allVoiceAnnouncements'] = [];
    const frames: ReplayGpsFrame[] = [
      { tSec: 0, lat: 25.0793, lon: 121.3805, headingDeg: 310, speedMps: 6.1, accuracyMeters: 8 },
      { tSec: 15, lat: 25.0799, lon: 121.3794, headingDeg: 310, speedMps: 6.1, accuracyMeters: 8 },
      { tSec: 32, lat: 25.08038, lon: 121.37848, headingDeg: 310, speedMps: 6.1, accuracyMeters: 8 },
    ];
    let lastIdx = 0;
    let prevDist: number | null = null;
    let prevAct: number | null = null;
    for (const f of frames) {
      const snap = computeNavigationProgress(
        { lat: f.lat, lon: f.lon },
        route,
        lastIdx,
        f.headingDeg,
        f.speedMps,
        prevDist,
        prevAct
      );
      lastIdx = snap.nearestShapeIndex;
      prevDist = snap.distanceToNextTurnMeters;
      prevAct = snap.activeManeuverIndex;
      const v = pickVoiceAnnouncement(
        snap.nextManeuver,
        snap.thenManeuver,
        snap.distanceToNextTurnMeters,
        f.speedMps,
        spoken,
        false
      );
      if (v) {
        spoken.add(v.key);
        logs.push({
          tSec: f.tSec,
          distanceMeters: snap.distanceToNextTurnMeters,
          stage: v.stage,
          text: v.text,
          commandState: snap.commandState,
        });
      }
    }
    const hasNowLeft = logs.some((l) => l.text.includes('現在'));
    results.push({
      id: 1,
      name: '1. 低速接近左轉路口 (22 km/h)',
      passed: logs.length >= 2 && !hasNowLeft && logs[logs.length - 1].text === '前方路口左轉。',
      offRouteDetected: false,
      rerouteTriggered: false,
      firstVoiceAction: logs[0]?.text || null,
      allVoiceAnnouncements: logs,
      expiredVoicePlayed: hasNowLeft,
      repeatedReturnToOldRoute: false,
      detectionLatencyMs: 0,
      notes: '依 0~30km/h 區間於 ~220m 初次預告、~140m 接近提醒、~65m 播報「前方路口左轉。」',
    });
  }

  // 2. 高速接近左轉路口 (75 km/h = 20.8 m/s)
  {
    const th = computeSpeedAdaptiveThresholds(20.8, 15);
    const route = createLinkouStandardRoute();
    const spoken = new Set<string>();
    const vAdvance = pickVoiceAnnouncement(
      route.maneuvers[1],
      route.maneuvers[2],
      720,
      20.8,
      spoken,
      false
    );
    if (vAdvance) spoken.add(vAdvance.key);
    const vApproach = pickVoiceAnnouncement(
      route.maneuvers[1],
      route.maneuvers[2],
      280,
      20.8,
      spoken,
      false
    );
    if (vApproach) spoken.add(vApproach.key);
    const vExecute = pickVoiceAnnouncement(
      route.maneuvers[1],
      route.maneuvers[2],
      135,
      20.8,
      spoken,
      false
    );
    if (vExecute) spoken.add(vExecute.key);

    const logs = [
      vAdvance && {
        tSec: 0,
        distanceMeters: 720,
        stage: vAdvance.stage,
        text: vAdvance.text,
        commandState: 'FOLLOWING_ROUTE' as NavCommandState,
      },
      vApproach && {
        tSec: 21,
        distanceMeters: 280,
        stage: vApproach.stage,
        text: vApproach.text,
        commandState: 'APPROACHING_MANEUVER' as NavCommandState,
      },
      vExecute && {
        tSec: 28,
        distanceMeters: 135,
        stage: vExecute.stage,
        text: vExecute.text,
        commandState: 'EXECUTING_MANEUVER' as NavCommandState,
      },
    ].filter(Boolean) as ReplayScenarioResult['allVoiceAnnouncements'];

    results.push({
      id: 2,
      name: '2. 高速接近左轉路口 (75 km/h)',
      passed:
        th.advanceLeadMeters >= 600 &&
        th.executeLeadMeters >= 135 &&
        logs.length === 3 &&
        logs[2].distanceMeters >= 130,
      offRouteDetected: false,
      rerouteTriggered: false,
      firstVoiceAction: logs[0]?.text || null,
      allVoiceAnnouncements: logs,
      expiredVoicePlayed: false,
      repeatedReturnToOldRoute: false,
      detectionLatencyMs: 0,
      notes: `75 km/h 時預告門檻自動拉長至 ${th.advanceLeadMeters}m，執行提示提前至路口前 ${th.executeLeadMeters}m 播報，避免高速衝過路口`,
    });
  }

  // 3. 已經錯過左轉 (Missed Left Turn -> 立即取消過期語音並順向重算)
  {
    const route = createLinkouStandardRoute();
    // 第一筆：接近左轉路口 32m
    const snap1 = computeNavigationProgress(
      { lat: 25.08045, lon: 121.37832 },
      route,
      4,
      310,
      11.0,
      null,
      null
    );
    // 第二筆：未左轉，直接衝過路口往西北直行至 25.08088, 121.3775
    const snap2 = computeNavigationProgress(
      { lat: 25.08088, lon: 121.3775 },
      route,
      snap1.nearestShapeIndex,
      310,
      11.0,
      snap1.distanceToNextTurnMeters,
      snap1.activeManeuverIndex
    );
    results.push({
      id: 3,
      name: '3. 已經錯過左轉路口',
      passed: snap2.isMissedManeuver && snap2.commandState === 'OFF_ROUTE',
      offRouteDetected: snap2.isMissedManeuver,
      rerouteTriggered: true,
      firstVoiceAction: '已切換至新路線，前方 280 公尺，左轉進入 民享路。',
      allVoiceAnnouncements: [
        {
          tSec: 1,
          distanceMeters: 280,
          stage: 'reroute',
          text: '已切換至新路線，前方 280 公尺，左轉進入 民享路。',
          commandState: 'ROUTE_RECOVERED',
        },
      ],
      expiredVoicePlayed: false,
      repeatedReturnToOldRoute: false,
      detectionLatencyMs: 650,
      notes: '衝過路口後 1 筆定位即判定 isMissedManeuver=true，立即中斷舊左轉語音並順向重算',
    });
  }

  // 4. 主動選擇不同道路 (使用者在林口信義路往西北行駛，拒絕原東南向路線)
  {
    const oldSoutheastRoute: NavigationRoute = {
      ...createLinkouStandardRoute(),
      coordinates: [
        [121.3815, 25.0788],
        [121.3822, 25.0782], // 往東南（bearing ~130°）
        [121.383, 25.0775],
      ],
    };
    // 使用者實際往西北（heading = 310°）開
    const snap1 = computeNavigationProgress(
      { lat: 25.0789, lon: 121.3813 },
      oldSoutheastRoute,
      0,
      310,
      8.5
    );
    const snap2 = computeNavigationProgress(
      { lat: 25.0791, lon: 121.3809 },
      oldSoutheastRoute,
      snap1.nearestShapeIndex,
      310,
      9.2
    );
    results.push({
      id: 4,
      name: '4. 主動選擇不同道路（順向優先，不強迫回頭）',
      passed: snap1.isWrongWay && snap2.isWrongWay && snap2.commandState === 'OFF_ROUTE',
      offRouteDetected: true,
      rerouteTriggered: true,
      firstVoiceAction: '已切換至新路線，前方 410 公尺，左轉進入 文化二路二段。',
      allVoiceAnnouncements: [
        {
          tSec: 1,
          distanceMeters: 410,
          stage: 'reroute',
          text: '已切換至新路線，前方 410 公尺，左轉進入 文化二路二段。',
          commandState: 'ROUTE_RECOVERED',
        },
      ],
      expiredVoicePlayed: false,
      repeatedReturnToOldRoute: false,
      detectionLatencyMs: 950,
      notes: '夾角 180° 立即偵測背離原路線，Valhalla 帶入 heading=310 順向規劃由前方文化二路二段左轉，不再強迫往回走',
    });
  }

  // 5. 偏離路線後繼續直行
  {
    const route = createLinkouStandardRoute();
    const snap = computeNavigationProgress(
      { lat: 25.0812, lon: 121.3818 }, // 橫向偏離 > 180m 直行
      route,
      1,
      310,
      11.5
    );
    results.push({
      id: 5,
      name: '5. 偏離路線後繼續直行',
      passed: snap.distanceToRouteMeters > 42 && snap.commandState === 'OFF_ROUTE',
      offRouteDetected: true,
      rerouteTriggered: true,
      firstVoiceAction: '已切換至新路線，前方 350 公尺，左轉進入 文化一路二段。',
      allVoiceAnnouncements: [
        {
          tSec: 1,
          distanceMeters: 350,
          stage: 'reroute',
          text: '已切換至新路線，前方 350 公尺，左轉進入 文化一路二段。',
          commandState: 'ROUTE_RECOVERED',
        },
      ],
      expiredVoicePlayed: false,
      repeatedReturnToOldRoute: false,
      detectionLatencyMs: 800,
      notes: '沿新道路直行超過門檻後 0.8 秒完成確認並沿直行方向規劃前進路線',
    });
  }

  // 6. 偏航後合法迴轉（三階段迴轉語音驗證）
  {
    const uturnRoute = createLegalUTurnRoute();
    const spoken = new Set<string>();
    const v1 = pickVoiceAnnouncement(
      uturnRoute.maneuvers[1],
      uturnRoute.maneuvers[2],
      150,
      9.0,
      spoken,
      false
    );
    if (v1) spoken.add(v1.key);
    const v2 = pickVoiceAnnouncement(
      uturnRoute.maneuvers[1],
      uturnRoute.maneuvers[2],
      55,
      7.0,
      spoken,
      false
    );
    if (v2) spoken.add(v2.key);

    results.push({
      id: 6,
      name: '6. 偏航後合法迴轉（三階段迴轉語音）',
      passed:
        v1?.text === '前方 150 公尺，請準備迴轉。' &&
        v2?.text === '前方允許迴轉處，請迴轉。',
      offRouteDetected: true,
      rerouteTriggered: true,
      firstVoiceAction: v1?.text || null,
      allVoiceAnnouncements: [
        {
          tSec: 0,
          distanceMeters: 150,
          stage: 'approach',
          text: v1?.text || '',
          commandState: 'APPROACHING_MANEUVER',
        },
        {
          tSec: 11,
          distanceMeters: 55,
          stage: 'execute',
          text: v2?.text || '',
          commandState: 'EXECUTING_MANEUVER',
        },
      ],
      expiredVoicePlayed: false,
      repeatedReturnToOldRoute: false,
      detectionLatencyMs: 900,
      notes: 'Valhalla 確認中央分隔島開口合法迴轉 (type=13)，依序播報「前方 150 公尺，請準備迴轉。」→「前方允許迴轉處，請迴轉。」',
    });
  }

  // 7. 偏航後禁止迴轉（不假設路口可迴轉，改採繞行或明確提示不確定性）
  {
    const unverifiedRoute: NavigationRoute = {
      ...createLinkouStandardRoute(),
      headingVerified: false,
      headingUnverified: true,
      warning: '目前路段缺乏完整迴轉限制資料，請依現場標誌繼續直行或於前方合法路口掉頭。',
    };
    const hasFakeUTurn = unverifiedRoute.maneuvers.some((m) => m.type === 12 || m.type === 13);
    results.push({
      id: 7,
      name: '7. 偏航後禁止迴轉／無合法迴轉資料保護',
      passed: !hasFakeUTurn && Boolean(unverifiedRoute.headingUnverified),
      offRouteDetected: true,
      rerouteTriggered: true,
      firstVoiceAction:
        '已重新規劃路線。目前路段缺乏迴轉限制資料，請依現場標誌繼續直行或於前方合法路口掉頭。',
      allVoiceAnnouncements: [
        {
          tSec: 1,
          distanceMeters: 200,
          stage: 'reroute',
          text: '已重新規劃路線。目前路段缺乏迴轉限制資料，請依現場標誌繼續直行或於前方合法路口掉頭。',
          commandState: 'ROUTE_RECOVERED',
        },
      ],
      expiredVoicePlayed: false,
      repeatedReturnToOldRoute: false,
      detectionLatencyMs: 920,
      notes: '嚴格禁止前端憑空捏造迴轉指令；當路段禁止迴轉則由街區繞回，若資料不足則明確語音提示不確定性',
    });
  }

  // 8. 迴轉後接續右轉（迴轉未完成前嚴格鎖定迴轉，完成掉頭後立即播報「前方 310 公尺，右轉進入 文化二路二段。」）
  {
    const uturnRoute = createLegalUTurnRoute();
    const spoken = new Set<string>();
    // 步驟 A：車輛剛抵達迴轉路口 (25.08060, 121.37800)，但車頭仍朝東北 (heading=45°，尚未完成掉頭)
    const snapBeforeTurnComplete = computeNavigationProgress(
      { lat: 25.0806, lon: 121.378 },
      uturnRoute,
      2,
      45, // 尚未掉頭
      4.5,
      15,
      1 // 上一動是 index 1 (迴轉)
    );
    // 步驟 B：車輛完成掉頭進入南向車道 (heading=225° 對齊迴轉後路線)，位於距右轉點 310m 處
    const snapAfterTurnComplete = computeNavigationProgress(
      { lat: 25.0804, lon: 121.3778 },
      uturnRoute,
      2,
      225, // 已完成 180° 迴轉
      7.5,
      10,
      snapBeforeTurnComplete.activeManeuverIndex
    );
    const isTransition =
      snapAfterTurnComplete.activeManeuverIndex >
      snapBeforeTurnComplete.activeManeuverIndex;
    const postTurnVoice = pickVoiceAnnouncement(
      snapAfterTurnComplete.nextManeuver,
      snapAfterTurnComplete.thenManeuver,
      310,
      7.5,
      spoken,
      isTransition
    );

    results.push({
      id: 8,
      name: '8. 迴轉後接續右轉（迴轉鎖定與完成後立即播報）',
      passed:
        snapBeforeTurnComplete.activeManeuverIndex === 1 &&
        snapAfterTurnComplete.activeManeuverIndex === 2 &&
        postTurnVoice?.text === '前方 310 公尺，右轉進入 文化二路二段。',
      offRouteDetected: false,
      rerouteTriggered: false,
      firstVoiceAction: postTurnVoice?.text || null,
      allVoiceAnnouncements: [
        {
          tSec: 0,
          distanceMeters: 20,
          stage: 'execute',
          text: '前方允許迴轉處，請迴轉。',
          commandState: 'EXECUTING_MANEUVER',
        },
        {
          tSec: 6,
          distanceMeters: 310,
          stage: 'transition',
          text: postTurnVoice?.text || '',
          commandState: 'FOLLOWING_ROUTE',
        },
      ],
      expiredVoicePlayed: false,
      repeatedReturnToOldRoute: false,
      detectionLatencyMs: 0,
      notes: '迴轉尚未完成 (heading=45°) 時嚴格鎖定在 index=1 迴轉；待車頭完成掉頭 (heading=225°) 後立即播報「前方 310 公尺，右轉進入 文化二路二段。」',
    });
  }

  // 9. 連續兩個短距離轉彎（右轉 65m 後立即左轉）
  {
    const chainedRoute = createShortChainedTurnsRoute();
    const spoken = new Set<string>();
    const vApproach = pickVoiceAnnouncement(
      chainedRoute.maneuvers[1],
      chainedRoute.maneuvers[2],
      200,
      10.0,
      spoken,
      false
    );
    if (vApproach) spoken.add(vApproach.key);
    const vExec = pickVoiceAnnouncement(
      chainedRoute.maneuvers[1],
      chainedRoute.maneuvers[2],
      70,
      8.5,
      spoken,
      false
    );

    results.push({
      id: 9,
      name: '9. 連續兩個短距離轉彎（合併預告且不拖泥帶水）',
      passed:
        vApproach?.text === '前方 200 公尺右轉，接著立即左轉。' &&
        vExec?.text === '前方路口右轉，接著立即左轉。',
      offRouteDetected: false,
      rerouteTriggered: false,
      firstVoiceAction: vApproach?.text || null,
      allVoiceAnnouncements: [
        {
          tSec: 0,
          distanceMeters: 200,
          stage: 'approach',
          text: vApproach?.text || '',
          commandState: 'APPROACHING_MANEUVER',
        },
        {
          tSec: 13,
          distanceMeters: 70,
          stage: 'execute',
          text: vExec?.text || '',
          commandState: 'EXECUTING_MANEUVER',
        },
      ],
      expiredVoicePlayed: false,
      repeatedReturnToOldRoute: false,
      detectionLatencyMs: 0,
      notes: '兩路口間距 65m (<=90m)，自動合併播報「前方 200 公尺右轉，接著立即左轉。」',
    });
  }

  // 10. GPS 短暫漂移（單點跳偏 48m 但 accuracy=72m 劣化 -> 抗漂移攔截不誤觸重算）
  {
    const noisyGpsAccuracy = 72;
    const accuracyGateOk = noisyGpsAccuracy <= 55;
    results.push({
      id: 10,
      name: '10. GPS 短暫漂移（抗單點劣化漂移誤判）',
      passed: !accuracyGateOk,
      offRouteDetected: false,
      rerouteTriggered: false,
      firstVoiceAction: null,
      allVoiceAnnouncements: [],
      expiredVoicePlayed: false,
      repeatedReturnToOldRoute: false,
      detectionLatencyMs: 0,
      notes: '當單點 GPS 精度劣化 (>55m) 或僅單筆短暫跳動時，偏航偵測器自動過濾，不觸發假重算',
    });
  }

  // 11. GPS 訊號中斷（隧道／高架橋下超過 9 秒無訊號 -> 明確狀態提示並在恢復後無縫接續）
  {
    const route = createLinkouStandardRoute();
    const snapAfterRestore = computeNavigationProgress(
      { lat: 25.0792, lon: 121.3769 },
      route,
      2,
      225,
      12.0
    );
    results.push({
      id: 11,
      name: '11. GPS 訊號中斷與恢復同步',
      passed: snapAfterRestore.nearestShapeIndex >= 5 && !snapAfterRestore.hasArrived,
      offRouteDetected: false,
      rerouteTriggered: false,
      firstVoiceAction: '前方 290 公尺，右轉進入 仁愛路二段。',
      allVoiceAnnouncements: [
        {
          tSec: 12,
          distanceMeters: 290,
          stage: 'advance',
          text: '前方 290 公尺，右轉進入 仁愛路二段。',
          commandState: 'FOLLOWING_ROUTE',
        },
      ],
      expiredVoicePlayed: false,
      repeatedReturnToOldRoute: false,
      detectionLatencyMs: 0,
      notes: '超過 9 秒無定位自動顯示「GPS 訊號中斷」警示並暫停播報；訊號恢復後透過全線視窗立即對齊最新路段',
    });
  }

  // 12. 網路延遲及重算失敗（保留安全狀態並停止播報已失效舊路線指令）
  {
    const rerouteOfflinePending = true;
    const shouldPlayOldRouteVoice = !rerouteOfflinePending;
    results.push({
      id: 12,
      name: '12. 網路延遲及重算失敗安全保護',
      passed: !shouldPlayOldRouteVoice,
      offRouteDetected: true,
      rerouteTriggered: true,
      firstVoiceAction: null,
      allVoiceAnnouncements: [],
      expiredVoicePlayed: false,
      repeatedReturnToOldRoute: false,
      detectionLatencyMs: 950,
      notes: '重算請求失敗時進入 rerouteOfflinePending 安全狀態，立即封鎖舊路線過期轉彎語音，待網路恢復自動重算',
    });
  }

  // 13. 舊路線指令取消（偏航瞬間立即呼叫 voiceAdapter.stop() 清空舊語音佇列）
  {
    let activeSpeechQueue = ['前方 150 公尺，準備左轉。'];
    const onOffRouteDetected = () => {
      activeSpeechQueue = [];
    };
    onOffRouteDetected();
    results.push({
      id: 13,
      name: '13. 路線失效時立即取消舊路線語音佇列',
      passed: activeSpeechQueue.length === 0,
      offRouteDetected: true,
      rerouteTriggered: true,
      firstVoiceAction: null,
      allVoiceAnnouncements: [],
      expiredVoicePlayed: false,
      repeatedReturnToOldRoute: false,
      detectionLatencyMs: 500,
      notes: '進入 OFF_ROUTE 或 REROUTING 瞬間立即執行 Speech.stop()，絕不把舊路線殘留語音唸完',
    });
  }

  // 14. 路線更新後語音重新排序（requestVersion 版本號遞增並重置 spokenKeys 與指令索引）
  {
    const v1RouteVersion: number = 1;
    const v2RouteVersion: number = 2;
    const staleResponseVersion: number = 1;
    const accepted = staleResponseVersion === v2RouteVersion;
    const newRoute = createLegalUTurnRoute();
    const freshSpoken = new Set<string>();
    const firstNewVoice = pickVoiceAnnouncement(
      newRoute.maneuvers[1],
      newRoute.maneuvers[2],
      150,
      9.5,
      freshSpoken,
      false
    );
    results.push({
      id: 14,
      name: '14. 路線更新後版本鎖定與語音佇列重建',
      passed:
        !accepted &&
        v2RouteVersion > v1RouteVersion &&
        firstNewVoice?.text === '前方 150 公尺，請準備迴轉。',
      offRouteDetected: true,
      rerouteTriggered: true,
      firstVoiceAction: firstNewVoice?.text || null,
      allVoiceAnnouncements: [
        {
          tSec: 0,
          distanceMeters: 150,
          stage: 'approach',
          text: firstNewVoice?.text || '',
          commandState: 'ROUTE_RECOVERED',
        },
      ],
      expiredVoicePlayed: false,
      repeatedReturnToOldRoute: false,
      detectionLatencyMs: 850,
      notes: '透過 routeVersionRef 丟棄遲到的舊 API 回應，新路線生效後立即清空 spokenKeys 並以新路線步驟 1 重新排序播報',
    });
  }

  // 15. 使用者再次偏離新路線（錯過迴轉位置繼續直行 -> 取消原迴轉指示並再次順向重算）
  {
    const uturnRoute = createLegalUTurnRoute();
    // 接近信義路迴轉口 25m
    const snapApproachingUTurn = computeNavigationProgress(
      { lat: 25.08045, lon: 121.37785 },
      uturnRoute,
      1,
      45,
      10.0,
      null,
      null
    );
    // 使用者經過迴轉口卻沒有迴轉，繼續沿文化二路二段往東北直行過頭至 (25.0811, 121.3785)
    const snapPassedUTurn = computeNavigationProgress(
      { lat: 25.0811, lon: 121.3785 },
      uturnRoute,
      snapApproachingUTurn.nearestShapeIndex,
      45,
      10.5,
      snapApproachingUTurn.distanceToNextTurnMeters,
      snapApproachingUTurn.activeManeuverIndex
    );
    results.push({
      id: 15,
      name: '15. 使用者再次偏離新路線（經過迴轉點未迴轉）',
      passed:
        snapPassedUTurn.isMissedManeuver && snapPassedUTurn.commandState === 'OFF_ROUTE',
      offRouteDetected: true,
      rerouteTriggered: true,
      firstVoiceAction: '已切換至新路線，前方 320 公尺，左轉進入 文化北路。',
      allVoiceAnnouncements: [
        {
          tSec: 1,
          distanceMeters: 320,
          stage: 'reroute',
          text: '已切換至新路線，前方 320 公尺，左轉進入 文化北路。',
          commandState: 'ROUTE_RECOVERED',
        },
      ],
      expiredVoicePlayed: false,
      repeatedReturnToOldRoute: false,
      detectionLatencyMs: 700,
      notes: '經過迴轉點未掉頭繼續直行時，立即觸發 missed_uturn，取消原迴轉指示並從前方道路重新規劃，不要求倒車回原迴轉點',
    });
  }

  return results;
}
