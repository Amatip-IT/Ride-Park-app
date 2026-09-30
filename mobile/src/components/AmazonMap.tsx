import React, { useRef, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';
import { useThemeColors } from '@/hooks/useThemeColors';
import { fetchDrivingRoute } from '@/utils/routing';

export type MapCoordinate = { lat: number; lng: number };

interface AmazonMapProps {
  pickupLat?: number;
  pickupLng?: number;
  destinationLat?: number;
  destinationLng?: number;
  driverLat?: number;
  driverLng?: number;
  driverRotation?: number;
  /** Single-location pin (e.g. parking space) */
  locationLat?: number;
  locationLng?: number;
  /** Driving route polyline (ordered lat/lng points) */
  routeCoordinates?: MapCoordinate[];
  /** Increment to re-fit the map to the current route / markers (in-app navigate). */
  focusToken?: number;
}

/** OpenStreetMap raster tiles. No API key. */
const MAP_STYLE_JSON = JSON.stringify({
  version: 8,
  name: 'Gleezip Streets',
  glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
  sources: {
    osm: {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 22,
    },
  ],
});

export function AmazonMap({
  pickupLat,
  pickupLng,
  destinationLat,
  destinationLng,
  driverLat,
  driverLng,
  driverRotation = 0,
  locationLat,
  locationLng,
  routeCoordinates = [],
  focusToken = 0,
}: AmazonMapProps) {
  const colors = useThemeColors();
  const webViewRef = useRef<WebView>(null);
  const [resolvedRoute, setResolvedRoute] = useState<MapCoordinate[]>(routeCoordinates);

  const centerLng = driverLng || locationLng || pickupLng || -0.1276;
  const centerLat = driverLat || locationLat || pickupLat || 51.5072;

  const routeKey = useMemo(
    () =>
      routeCoordinates.length >= 2
        ? routeCoordinates.map((p) => `${p.lat},${p.lng}`).join('|')
        : '',
    [routeCoordinates],
  );

  // Prefer caller-provided route; otherwise fetch a driving line when both ends exist
  useEffect(() => {
    let cancelled = false;

    if (routeCoordinates.length >= 2) {
      setResolvedRoute(routeCoordinates);
      return;
    }

    const hasPickup = pickupLat != null && pickupLng != null;
    const hasDest = destinationLat != null && destinationLng != null;
    if (!hasPickup || !hasDest) {
      setResolvedRoute([]);
      return;
    }

    (async () => {
      const coords = await fetchDrivingRoute(
        { lat: pickupLat!, lng: pickupLng! },
        { lat: destinationLat!, lng: destinationLng! },
      );
      if (!cancelled) setResolvedRoute(coords);
    })();

    return () => {
      cancelled = true;
    };
  }, [pickupLat, pickupLng, destinationLat, destinationLng, routeKey]);


  const routeJson = useMemo(
    () => JSON.stringify(resolvedRoute.filter((p) => p.lat && p.lng)),
    [resolvedRoute],
  );

  const mapKey = useMemo(
    () =>
      `map-${pickupLat}-${pickupLng}-${destinationLat}-${destinationLng}-${locationLat}-${locationLng}-${resolvedRoute.length}`,
    [
      pickupLat,
      pickupLng,
      destinationLat,
      destinationLng,
      locationLat,
      locationLng,
      resolvedRoute.length,
    ],
  );

  useEffect(() => {
    if (webViewRef.current && driverLat && driverLng) {
      const js = `
        if (window.updateDriverLocation) {
          window.updateDriverLocation(${driverLng}, ${driverLat}, ${driverRotation});
        }
        if (window.panToDriver) {
          window.panToDriver(${driverLng}, ${driverLat});
        }
        true;
      `;
      webViewRef.current.injectJavaScript(js);
    }
  }, [driverLat, driverLng, driverRotation]);

  useEffect(() => {
    if (!focusToken || !webViewRef.current) return;
    webViewRef.current.injectJavaScript(`
      try {
        if (window.fitJourney) { window.fitJourney(); }
        else if (window.__gleezipMap) { window.__gleezipMap.resize(); }
      } catch (e) {}
      true;
    `);
  }, [focusToken]);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link href="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.css" rel="stylesheet" />
        <style>
          html, body { margin: 0; padding: 0; width: 100%; height: 100%; background: #e8eef5; }
          #map { position: absolute; inset: 0; background: #e8eef5; }
          .marker-pickup {
            background-color: #10B981;
            width: 18px; height: 18px; border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 0 10px rgba(0,0,0,0.35);
          }
          .marker-destination {
            background-color: #EF4444;
            width: 18px; height: 18px; border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 0 10px rgba(0,0,0,0.35);
          }
          .marker-location {
            background-color: #3B82F6;
            width: 28px; height: 28px; border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 0 10px rgba(0,0,0,0.35);
            display: flex; align-items: center; justify-content: center;
            color: white; font-weight: 700; font-size: 14px;
            font-family: system-ui, sans-serif;
          }
          .marker-car {
            display: flex; justify-content: center; align-items: center;
          }
          .marker-car svg {
            width: 36px; height: 36px;
            filter: drop-shadow(0px 4px 8px rgba(0,0,0,0.4));
          }
          .marker-pickup { animation: pulse-pickup 2s infinite; }
          @keyframes pulse-pickup {
            0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.5); }
            70% { box-shadow: 0 0 0 12px rgba(16, 185, 129, 0); }
            100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script src="https://unpkg.com/maplibre-gl@3.6.2/dist/maplibre-gl.js"></script>
        <script>
          try {
            const style = ${MAP_STYLE_JSON};
            const map = new maplibregl.Map({
              container: "map",
              style: style,
              center: [${centerLng}, ${centerLat}],
              zoom: 14,
              pitch: 0,
              bearing: 0,
              attributionControl: true
            });
            window.__gleezipMap = map;

            map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

            let carMarker = null;
            let animFrame = null;
            let currentLng = null;
            let currentLat = null;

            function animateMarker(targetLng, targetLat, duration) {
              if (currentLng === null) {
                currentLng = targetLng;
                currentLat = targetLat;
                carMarker.setLngLat([targetLng, targetLat]);
                return;
              }
              const startLng = currentLng;
              const startLat = currentLat;
              const startTime = performance.now();

              function step(now) {
                const t = Math.min((now - startTime) / duration, 1);
                const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
                const lng = startLng + (targetLng - startLng) * ease;
                const lat = startLat + (targetLat - startLat) * ease;
                carMarker.setLngLat([lng, lat]);
                if (t < 1) {
                  animFrame = requestAnimationFrame(step);
                } else {
                  currentLng = targetLng;
                  currentLat = targetLat;
                }
              }
              if (animFrame) cancelAnimationFrame(animFrame);
              animFrame = requestAnimationFrame(step);
            }

            const carSvg = '<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" stroke="#1a1a1a" stroke-width="1.5" stroke-linecap="round"/><rect x="3" y="11" width="18" height="7" rx="2" fill="#1a1a1a"/><circle cx="7.5" cy="18" r="1.5" fill="#1a1a1a" stroke="#fff" stroke-width="1"/><circle cx="16.5" cy="18" r="1.5" fill="#1a1a1a" stroke="#fff" stroke-width="1"/><path d="M6 14h3M15 14h3" stroke="#fff" stroke-width="1" stroke-linecap="round"/><path d="M8 8h8" stroke="#1a1a1a" stroke-width="1" stroke-linecap="round"/><rect x="7" y="11" width="10" height="4" rx="1" fill="#333" opacity="0.3"/></svg>';

            window.updateDriverLocation = (lng, lat, rotation) => {
              if (!carMarker) {
                const carEl = document.createElement('div');
                carEl.className = 'marker-car';
                carEl.innerHTML = carSvg;
                carMarker = new maplibregl.Marker({ element: carEl })
                  .setLngLat([lng, lat])
                  .addTo(map);
                currentLng = lng;
                currentLat = lat;
              } else {
                animateMarker(lng, lat, 1500);
              }
              const svgEl = carMarker.getElement().querySelector('svg');
              if (svgEl) {
                svgEl.style.transform = 'rotate(' + (rotation || 0) + 'deg)';
                svgEl.style.transition = 'transform 0.8s ease';
              }
            };

            let lastPanTime = 0;
            window.panToDriver = (lng, lat) => {
              const now = Date.now();
              if (now - lastPanTime > 5000) {
                map.easeTo({ center: [lng, lat], duration: 1200 });
                lastPanTime = now;
              }
            };

            const addRouteLine = (coords) => {
              if (!coords || coords.length < 2) return;
              const geojson = {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: coords.map(c => [c.lng, c.lat])
                }
              };
              if (map.getSource('route')) {
                map.getSource('route').setData(geojson);
              } else {
                map.addSource('route', { type: 'geojson', data: geojson });
                map.addLayer({
                  id: 'route-glow',
                  type: 'line',
                  source: 'route',
                  layout: { 'line-join': 'round', 'line-cap': 'round' },
                  paint: {
                    'line-color': '#0EA5E9',
                    'line-width': 10,
                    'line-opacity': 0.25
                  }
                });
                map.addLayer({
                  id: 'route-line',
                  type: 'line',
                  source: 'route',
                  layout: { 'line-join': 'round', 'line-cap': 'round' },
                  paint: {
                    'line-color': '#2563EB',
                    'line-width': 5,
                    'line-opacity': 0.95
                  }
                });
              }
            };

            const fitJourney = () => {
              const bounds = new maplibregl.LngLatBounds();
              let hasBounds = false;
              const routeCoords = ${routeJson};
              if (routeCoords.length >= 2) {
                routeCoords.forEach(c => { bounds.extend([c.lng, c.lat]); hasBounds = true; });
              }
              if (${pickupLng ? 'true' : 'false'}) {
                bounds.extend([${pickupLng ?? 0}, ${pickupLat ?? 0}]);
                hasBounds = true;
              }
              if (${destinationLng ? 'true' : 'false'}) {
                bounds.extend([${destinationLng ?? 0}, ${destinationLat ?? 0}]);
                hasBounds = true;
              }
              if (${driverLng ? 'true' : 'false'} && ${driverLat ? 'true' : 'false'}) {
                bounds.extend([${driverLng}, ${driverLat}]);
                hasBounds = true;
              }
              if (hasBounds) {
                map.fitBounds(bounds, {
                  padding: { top: 80, bottom: 220, left: 56, right: 56 },
                  maxZoom: 15,
                  duration: 700
                });
              }
              map.resize();
            };
            window.fitJourney = fitJourney;

            map.on('load', () => {
              const bounds = new maplibregl.LngLatBounds();
              let hasBounds = false;

              const routeCoords = ${routeJson};
              if (routeCoords.length >= 2) {
                addRouteLine(routeCoords);
                routeCoords.forEach(c => {
                  bounds.extend([c.lng, c.lat]);
                  hasBounds = true;
                });
              } else if (${pickupLng ? 'true' : 'false'} && ${destinationLng ? 'true' : 'false'}) {
                // Straight fallback line until road route arrives / if OSRM fails
                addRouteLine([
                  { lng: ${pickupLng ?? 0}, lat: ${pickupLat ?? 0} },
                  { lng: ${destinationLng ?? 0}, lat: ${destinationLat ?? 0} }
                ]);
              }

              if (${pickupLng ? 'true' : 'false'}) {
                const pickupEl = document.createElement('div');
                pickupEl.className = 'marker-pickup';
                new maplibregl.Marker({ element: pickupEl })
                  .setLngLat([${pickupLng ?? 0}, ${pickupLat ?? 0}])
                  .addTo(map);
                bounds.extend([${pickupLng ?? 0}, ${pickupLat ?? 0}]);
                hasBounds = true;
              }

              if (${destinationLng ? 'true' : 'false'}) {
                const destEl = document.createElement('div');
                destEl.className = 'marker-destination';
                new maplibregl.Marker({ element: destEl })
                  .setLngLat([${destinationLng ?? 0}, ${destinationLat ?? 0}])
                  .addTo(map);
                bounds.extend([${destinationLng ?? 0}, ${destinationLat ?? 0}]);
                hasBounds = true;
              }

              if (${locationLng ? 'true' : 'false'}) {
                const locEl = document.createElement('div');
                locEl.className = 'marker-location';
                locEl.textContent = 'P';
                new maplibregl.Marker({ element: locEl })
                  .setLngLat([${locationLng ?? 0}, ${locationLat ?? 0}])
                  .addTo(map);
                bounds.extend([${locationLng ?? 0}, ${locationLat ?? 0}]);
                hasBounds = true;
              }

              if (${driverLng ? 'true' : 'false'} && ${driverLat ? 'true' : 'false'}) {
                window.updateDriverLocation(${driverLng}, ${driverLat}, ${driverRotation});
                bounds.extend([${driverLng}, ${driverLat}]);
                hasBounds = true;
              }

              fitJourney();
              setTimeout(function() { map.resize(); fitJourney(); }, 250);
            });

            map.on('error', function(e) {
              console.warn('MapLibre error', e && e.error);
            });
          } catch (e) {
            console.error('MapLibre init error:', e);
            document.body.innerHTML = '<div style="padding:24px;font-family:system-ui;color:#111">Map failed to load.</div>';
          }
        </script>
      </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        key={mapKey}
        ref={webViewRef}
        originWhitelist={['*']}
        source={{ html: htmlContent, baseUrl: 'https://localhost' }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        allowsInlineMediaPlayback
        setSupportMultipleWindows={false}
        androidLayerType="hardware"
        startInLoadingState
        renderLoading={() => (
          <ActivityIndicator style={styles.loader} size="large" color={colors.electricTeal} />
        )}
        onLoadEnd={() => {
          webViewRef.current?.injectJavaScript(`
            if (window.maplibre && false) {}
            try { if (typeof map !== 'undefined') map.resize(); } catch (e) {}
            true;
          `);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#E8EEF5',
  },
  webview: {
    flex: 1,
    backgroundColor: '#E8EEF5',
  },
  loader: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -18,
    marginTop: -18,
  },
});
