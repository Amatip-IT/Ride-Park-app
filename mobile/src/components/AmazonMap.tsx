import React, { useRef, useEffect, useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';

export type MapCoordinate = { lat: number; lng: number };

interface AmazonMapProps {
  pickupLat?: number;
  pickupLng?: number;
  destinationLat?: number;
  destinationLng?: number;
  driverLat?: number;
  driverLng?: number;
  driverRotation?: number;
  /** Driving route polyline (ordered lat/lng points) */
  routeCoordinates?: MapCoordinate[];
}

export function AmazonMap({
  pickupLat,
  pickupLng,
  destinationLat,
  destinationLng,
  driverLat,
  driverLng,
  driverRotation = 0,
  routeCoordinates = [],
}: AmazonMapProps) {
  const webViewRef = useRef<WebView>(null);

  const centerLng = driverLng || pickupLng || -0.1276;
  const centerLat = driverLat || pickupLat || 51.5072;

  const routeJson = useMemo(
    () => JSON.stringify(routeCoordinates.filter((p) => p.lat && p.lng)),
    [routeCoordinates],
  );

  const mapKey = useMemo(
    () =>
      `map-${pickupLat}-${pickupLng}-${destinationLat}-${destinationLng}-${routeCoordinates.length}`,
    [
      pickupLat,
      pickupLng,
      destinationLat,
      destinationLng,
      routeCoordinates.length,
    ],
  );

  useEffect(() => {
    if (webViewRef.current && driverLat && driverLng) {
      const js = `
        if (window.updateDriverLocation) {
          window.updateDriverLocation(${driverLng}, ${driverLat}, ${driverRotation});
        }
        true;
      `;
      webViewRef.current.injectJavaScript(js);
    }
  }, [driverLat, driverLng, driverRotation]);

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <link href="https://unpkg.com/maplibre-gl@3.x/dist/maplibre-gl.css" rel="stylesheet" />
        <style>
          body { margin: 0; padding: 0; }
          #map { width: 100vw; height: 100vh; }
          .marker-pickup {
            background-color: #10B981;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
          }
          .marker-destination {
            background-color: #EF4444;
            width: 20px;
            height: 20px;
            border-radius: 50%;
            border: 3px solid white;
            box-shadow: 0 0 10px rgba(0,0,0,0.5);
          }
          .marker-car {
            display: flex;
            justify-content: center;
            align-items: center;
          }
          .marker-car span {
            font-size: 26px;
            filter: drop-shadow(0px 3px 6px rgba(0,0,0,0.4));
          }
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script src="https://unpkg.com/maplibre-gl@3.x/dist/maplibre-gl.js"></script>
        <script>
          try {
            const map = new maplibregl.Map({
              container: "map",
              style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json",
              center: [${centerLng}, ${centerLat}],
              zoom: 14,
              pitch: 45,
              bearing: -15,
              attributionControl: false
            });

            map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

            let carMarker = null;
            window.updateDriverLocation = (lng, lat, rotation) => {
              if (!carMarker) {
                const carEl = document.createElement('div');
                carEl.className = 'marker-car';
                carEl.innerHTML = '<span>🚗</span>';
                carMarker = new maplibregl.Marker({ element: carEl })
                  .setLngLat([lng, lat])
                  .addTo(map);
              } else {
                carMarker.setLngLat([lng, lat]);
              }
              const carSpan = carMarker.getElement().querySelector('span');
              if (carSpan) {
                carSpan.style.display = 'inline-block';
                carSpan.style.transform = 'rotate(' + (rotation || 0) + 'deg)';
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
                  id: 'route-line',
                  type: 'line',
                  source: 'route',
                  layout: { 'line-join': 'round', 'line-cap': 'round' },
                  paint: {
                    'line-color': '#00C2A8',
                    'line-width': 5,
                    'line-opacity': 0.85
                  }
                });
              }
            };

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

              if (${driverLng ? 'true' : 'false'} && ${driverLat ? 'true' : 'false'}) {
                window.updateDriverLocation(${driverLng}, ${driverLat}, ${driverRotation});
                bounds.extend([${driverLng}, ${driverLat}]);
                hasBounds = true;
              }

              if (hasBounds) {
                map.fitBounds(bounds, {
                  padding: 70,
                  maxZoom: 16,
                  pitch: 45,
                  bearing: -15
                });
              }
            });
          } catch (e) {
            console.error('MapLibre init error:', e);
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
        source={{ html: htmlContent }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        startInLoadingState={true}
        renderLoading={() => (
          <ActivityIndicator style={styles.loader} size="large" color="#00B4A0" />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  webview: {
    flex: 1,
    backgroundColor: '#E2E8F0',
  },
  loader: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -18,
    marginTop: -18,
  },
});
