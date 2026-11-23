import React from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { HdRoadsPayload } from '../../navigation/types';

interface HdRoadLayersProps {
  hdDetailActive: boolean;
  hdRoads: HdRoadsPayload | null;
  isNight: boolean;
  liveTrafficGeoJSON: GeoJSON.FeatureCollection | null;
}

const BELOW_ROAD_LABELS_LAYER_ID = 'highway-name-minor';

/**
 * V3 純路面標線與分隔島圖層（React.memo 隔離 GPS 高頻重繪）
 * - 道路本體、路口連接與橋樑／隧道上下層全部交還連續無縫的 Vector Tile 渲染
 * - 本元件僅渲染純標線與分隔島，並透過 belowLayerID 插入路名與 POI 下方，絕不遮擋道路名稱
 */
export const HdRoadLayers: React.FC<HdRoadLayersProps> = React.memo(
  ({ hdDetailActive, hdRoads, isNight, liveTrafficGeoJSON }) => {
    const layers = hdRoads?.layers;
    return (
      <>
        {hdDetailActive && layers?.medians && layers.medians.features.length > 0 && (
          <GeoJSONSource id="goba-hd-medians-src" data={layers.medians}>
            <Layer
              id="goba-hd-medians-fill"
              type="fill"
              beforeId={BELOW_ROAD_LABELS_LAYER_ID}
              minzoom={16}
              paint={{
                'fill-color': isNight ? '#14532D' : '#A3DFA9',
                'fill-outline-color': isNight ? '#166534' : '#7BC686',
                'fill-opacity': 0.92,
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.bus_lanes && layers.bus_lanes.features.length > 0 && (
          <GeoJSONSource id="goba-hd-buslanes-src" data={layers.bus_lanes}>
            <Layer
              id="goba-hd-buslanes-fill"
              type="fill"
              beforeId={BELOW_ROAD_LABELS_LAYER_ID}
              minzoom={16.5}
              paint={{
                'fill-color': isNight ? 'rgba(59, 130, 246, 0.28)' : 'rgba(59, 130, 246, 0.20)',
                'fill-outline-color': 'rgba(37, 99, 235, 0.45)',
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.center_lines && layers.center_lines.features.length > 0 && (
          <GeoJSONSource id="goba-hd-center-src" data={layers.center_lines}>
            <Layer
              id="goba-hd-yellow-center"
              type="line"
              beforeId={BELOW_ROAD_LABELS_LAYER_ID}
              minzoom={16.5}
              layout={{ 'line-cap': 'butt', 'line-join': 'round' }}
              paint={{
                'line-color': '#F4C44E',
                'line-width': 1.5,
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.lane_dividers && layers.lane_dividers.features.length > 0 && (
          <GeoJSONSource id="goba-hd-lanes-src" data={layers.lane_dividers}>
            <Layer
              id="goba-hd-lane-dashes"
              type="line"
              beforeId={BELOW_ROAD_LABELS_LAYER_ID}
              minzoom={16.5}
              layout={{ 'line-cap': 'butt' }}
              paint={{
                'line-color': isNight ? 'rgba(226,232,240,0.75)' : 'rgba(148,163,184,0.65)',
                'line-width': 1.3,
                'line-dasharray': [5, 5],
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive &&
          layers?.bridge_lane_dividers &&
          layers.bridge_lane_dividers.features.length > 0 && (
            <GeoJSONSource id="goba-hd-bridge-lanes-src" data={layers.bridge_lane_dividers}>
              <Layer
                id="goba-hd-bridge-lanes"
                type="line"
                beforeId={BELOW_ROAD_LABELS_LAYER_ID}
                minzoom={16.5}
                layout={{ 'line-cap': 'butt' }}
                paint={{
                  'line-color': isNight ? 'rgba(226,232,240,0.78)' : 'rgba(148,163,184,0.68)',
                  'line-width': 1.3,
                  'line-dasharray': [5, 5],
                }}
              />
            </GeoJSONSource>
          )}
        {hdDetailActive && layers?.crosswalks && layers.crosswalks.features.length > 0 && (
          <GeoJSONSource id="goba-hd-crosswalks-src" data={layers.crosswalks}>
            <Layer
              id="goba-hd-crosswalk-stripes"
              type="line"
              beforeId={BELOW_ROAD_LABELS_LAYER_ID}
              minzoom={16.8}
              layout={{ 'line-cap': 'butt' }}
              paint={{
                'line-color': isNight ? 'rgba(241,245,249,0.72)' : 'rgba(148,163,184,0.72)',
                'line-width': 2.0,
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.stop_lines && layers.stop_lines.features.length > 0 && (
          <GeoJSONSource id="goba-hd-stoplines-src" data={layers.stop_lines}>
            <Layer
              id="goba-hd-stop-line"
              type="line"
              beforeId={BELOW_ROAD_LABELS_LAYER_ID}
              minzoom={16.8}
              layout={{ 'line-cap': 'butt' }}
              paint={{
                'line-color': isNight ? 'rgba(248,250,252,0.82)' : 'rgba(100,116,139,0.75)',
                'line-width': 2.2,
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.arrows && layers.arrows.features.length > 0 && (
          <GeoJSONSource id="goba-hd-arrows-src" data={layers.arrows}>
            <Layer
              id="goba-hd-arrow-symbols"
              type="symbol"
              beforeId={BELOW_ROAD_LABELS_LAYER_ID}
              minzoom={17.2}
              layout={{
                'text-field': ['get', 'symbol'],
                'text-size': 14,
                'text-rotate': ['get', 'bearing'],
                'text-rotation-alignment': 'map',
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              }}
              paint={{
                'text-color': isNight ? 'rgba(226,232,240,0.72)' : 'rgba(71,85,105,0.75)',
              }}
            />
          </GeoJSONSource>
        )}

        {/* 預留合法即時路況圖層（無資料時維持 null，不偽造順暢線） */}
        {liveTrafficGeoJSON && (
          <GeoJSONSource id="goba-live-traffic-source" data={liveTrafficGeoJSON}>
            <Layer
              id="goba-live-traffic-line"
              type="line"
              beforeId={BELOW_ROAD_LABELS_LAYER_ID}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': [
                  'match',
                  ['get', 'congestion'],
                  'smooth',
                  '#22C55E',
                  'moderate',
                  '#F59E0B',
                  'heavy',
                  '#EF4444',
                  'severe',
                  '#991B1B',
                  'transparent',
                ],
                'line-width': 3.5,
              }}
            />
          </GeoJSONSource>
        )}
      </>
    );
  }
);
