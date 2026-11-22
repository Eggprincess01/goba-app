import React from 'react';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { HdRoadsPayload } from '../../navigation/types';

interface HdRoadLayersProps {
  hdDetailActive: boolean;
  hdRoads: HdRoadsPayload | null;
  isNight: boolean;
  liveTrafficGeoJSON: GeoJSON.FeatureCollection | null;
}

/**
 * 高精度道路面積、3D 高架橋、分隔島與真實車道標線圖層（React.memo 隔離 GPS 高頻重繪）
 */
export const HdRoadLayers: React.FC<HdRoadLayersProps> = React.memo(
  ({ hdDetailActive, hdRoads, isNight, liveTrafficGeoJSON }) => {
    const layers = hdRoads?.layers;
    return (
      <>
        {hdDetailActive && layers?.road_surfaces && (
          <GeoJSONSource id="goba-hd-surfaces-src" data={layers.road_surfaces}>
            <Layer
              id="goba-hd-road-casing"
              type="fill"
              minzoom={16}
              paint={{
                'fill-color': isNight ? '#1E293B' : '#94A0B0',
                'fill-opacity': 1,
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.road_asphalt && (
          <GeoJSONSource id="goba-hd-asphalt-src" data={layers.road_asphalt}>
            <Layer
              id="goba-hd-road-fill"
              type="fill"
              minzoom={16}
              paint={{
                'fill-color': isNight
                  ? '#334155'
                  : [
                      'match',
                      ['get', 'road_class'],
                      'primary',
                      '#A8B1BE',
                      'secondary',
                      '#B2BAC5',
                      'tertiary',
                      '#B2BAC5',
                      '#C4CBD4',
                    ],
                'fill-opacity': 1,
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.medians && (
          <GeoJSONSource id="goba-hd-medians-src" data={layers.medians}>
            <Layer
              id="goba-hd-medians-fill"
              type="fill"
              minzoom={16}
              paint={{
                'fill-color': isNight ? '#14532D' : '#A3DFA9',
                'fill-outline-color': isNight ? '#166534' : '#7BC686',
                'fill-opacity': 0.96,
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.bus_lanes && (
          <GeoJSONSource id="goba-hd-buslanes-src" data={layers.bus_lanes}>
            <Layer
              id="goba-hd-buslanes-fill"
              type="fill"
              minzoom={16.5}
              paint={{
                'fill-color': isNight ? 'rgba(59, 130, 246, 0.28)' : 'rgba(59, 130, 246, 0.22)',
                'fill-outline-color': 'rgba(37, 99, 235, 0.45)',
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.edge_lines && (
          <GeoJSONSource id="goba-hd-edges-src" data={layers.edge_lines}>
            <Layer
              id="goba-hd-edge-lines"
              type="line"
              minzoom={16.5}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': isNight ? 'rgba(203,213,225,0.45)' : 'rgba(255,255,255,0.72)',
                'line-width': 1.2,
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.center_lines && (
          <GeoJSONSource id="goba-hd-center-src" data={layers.center_lines}>
            <Layer
              id="goba-hd-yellow-center"
              type="line"
              minzoom={16.5}
              layout={{ 'line-cap': 'butt', 'line-join': 'round' }}
              paint={{
                'line-color': '#F4C44E',
                'line-width': 1.6,
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.lane_dividers && (
          <GeoJSONSource id="goba-hd-lanes-src" data={layers.lane_dividers}>
            <Layer
              id="goba-hd-lane-dashes"
              type="line"
              minzoom={16.5}
              layout={{ 'line-cap': 'butt' }}
              paint={{
                'line-color': isNight ? '#E2E8F0' : '#FFFFFF',
                'line-opacity': [
                  'match',
                  ['get', 'accuracy'],
                  'approximate_visual_only',
                  isNight ? 0.48 : 0.68,
                  isNight ? 0.72 : 0.9,
                ],
                'line-width': 1.4,
                'line-dasharray': [5, 5],
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.crosswalks && (
          <GeoJSONSource id="goba-hd-crosswalks-src" data={layers.crosswalks}>
            <Layer
              id="goba-hd-crosswalk-stripes"
              type="line"
              minzoom={16.8}
              layout={{ 'line-cap': 'butt' }}
              paint={{
                'line-color': isNight ? 'rgba(241,245,249,0.72)' : 'rgba(255,255,255,0.92)',
                'line-width': 2.2,
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.stop_lines && (
          <GeoJSONSource id="goba-hd-stoplines-src" data={layers.stop_lines}>
            <Layer
              id="goba-hd-stop-line"
              type="line"
              minzoom={16.8}
              layout={{ 'line-cap': 'butt' }}
              paint={{
                'line-color': isNight ? 'rgba(248,250,252,0.82)' : 'rgba(255,255,255,0.95)',
                'line-width': 2.4,
              }}
            />
          </GeoJSONSource>
        )}

        {/* 3D 立體高架橋樑／交流道圖層（繪製於所有平面道路與標線之上） */}
        {hdDetailActive && layers?.bridge_shadows && (
          <GeoJSONSource id="goba-hd-bridge-shadow-src" data={layers.bridge_shadows}>
            <Layer
              id="goba-hd-bridge-shadow"
              type="fill"
              minzoom={15.5}
              paint={{
                'fill-color': isNight ? 'rgba(2, 6, 23, 0.55)' : 'rgba(15, 23, 42, 0.22)',
                'fill-opacity': 0.9,
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.bridge_piers && (
          <GeoJSONSource id="goba-hd-bridge-piers-src" data={layers.bridge_piers}>
            <Layer
              id="goba-hd-bridge-piers-3d"
              type="fill-extrusion"
              minzoom={16}
              paint={{
                'fill-extrusion-color': isNight ? '#475569' : '#94A3B8',
                'fill-extrusion-base': ['get', 'base_height'],
                'fill-extrusion-height': ['get', 'height'],
                'fill-extrusion-opacity': 0.95,
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.bridge_decks_3d && (
          <GeoJSONSource id="goba-hd-bridge-decks-src" data={layers.bridge_decks_3d}>
            <Layer
              id="goba-hd-bridge-decks-3d"
              type="fill-extrusion"
              minzoom={15.8}
              paint={{
                'fill-extrusion-color': isNight ? '#334155' : '#A6B0BE',
                'fill-extrusion-base': ['get', 'base_height'],
                'fill-extrusion-height': ['get', 'height'],
                'fill-extrusion-opacity': 0.98,
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.bridge_surfaces && (
          <GeoJSONSource id="goba-hd-bridge-casing-src" data={layers.bridge_surfaces}>
            <Layer
              id="goba-hd-bridge-casing"
              type="fill"
              minzoom={15.5}
              paint={{
                'fill-color': isNight ? '#475569' : '#64748B',
                'fill-opacity': 1,
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.bridge_asphalt && (
          <GeoJSONSource id="goba-hd-bridge-asphalt-src" data={layers.bridge_asphalt}>
            <Layer
              id="goba-hd-bridge-fill"
              type="fill"
              minzoom={15.5}
              paint={{
                'fill-color': isNight ? '#3B4A62' : '#ADB6C4',
                'fill-opacity': 1,
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.bridge_edge_lines && (
          <GeoJSONSource id="goba-hd-bridge-edges-src" data={layers.bridge_edge_lines}>
            <Layer
              id="goba-hd-bridge-edges"
              type="line"
              minzoom={16}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': isNight ? 'rgba(226,232,240,0.65)' : 'rgba(255,255,255,0.88)',
                'line-width': 1.5,
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.bridge_lane_dividers && (
          <GeoJSONSource id="goba-hd-bridge-lanes-src" data={layers.bridge_lane_dividers}>
            <Layer
              id="goba-hd-bridge-lanes"
              type="line"
              minzoom={16.2}
              layout={{ 'line-cap': 'butt' }}
              paint={{
                'line-color': isNight ? '#E2E8F0' : '#FFFFFF',
                'line-opacity': 0.9,
                'line-width': 1.4,
                'line-dasharray': [5, 5],
              }}
            />
          </GeoJSONSource>
        )}
        {hdDetailActive && layers?.arrows && (
          <GeoJSONSource id="goba-hd-arrows-src" data={layers.arrows}>
            <Layer
              id="goba-hd-arrow-symbols"
              type="symbol"
              minzoom={17.2}
              layout={{
                'text-field': ['get', 'symbol'],
                'text-size': 15,
                'text-rotate': ['get', 'bearing'],
                'text-rotation-alignment': 'map',
                'text-allow-overlap': true,
                'text-ignore-placement': true,
              }}
              paint={{
                'text-color': isNight ? 'rgba(226,232,240,0.7)' : 'rgba(255,255,255,0.85)',
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
