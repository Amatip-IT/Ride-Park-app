import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';

interface AmazonMapProps {
  pickupLat?: number;
  pickupLng?: number;
  destinationLat?: number;
  destinationLng?: number;
}

export function AmazonMap({
  pickupLat,
  pickupLng,
  destinationLat,
  destinationLng,
}: AmazonMapProps) {
  const AWS_API_KEY = process.env.EXPO_PUBLIC_AWS_LOCATION_KEY || '';
  const AWS_REGION = process.env.EXPO_PUBLIC_AWS_REGION || 'us-east-1';

  // Fallback map center if no coordinates
  const centerLng = pickupLng || -0.1276;
  const centerLat = pickupLat || 51.5072; // London default

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
        </style>
      </head>
      <body>
        <div id="map"></div>
        <script src="https://unpkg.com/maplibre-gl@3.x/dist/maplibre-gl.js"></script>
        <script>
          try {
            const apiKey = "${AWS_API_KEY}";
            const region = "${AWS_REGION}";
            const style = "Standard";
            const colorScheme = "Light";

            const map = new maplibregl.Map({
              container: "map",
              style: \`https://maps.geo.\${region}.amazonaws.com/v2/styles/\${style}/descriptor?key=\${apiKey}&color-scheme=\${colorScheme}\`,
              center: [${centerLng}, ${centerLat}],
              zoom: 12,
              attributionControl: false
            });

            // Add Navigation Controls
            map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

            map.on('load', () => {
              const bounds = new maplibregl.LngLatBounds();
              let hasBounds = false;

              // Pickup Marker
              if (${pickupLng ? 'true' : 'false'}) {
                const pickupEl = document.createElement('div');
                pickupEl.className = 'marker-pickup';
                new maplibregl.Marker({ element: pickupEl })
                  .setLngLat([${pickupLng}, ${pickupLat}])
                  .addTo(map);
                
                bounds.extend([${pickupLng}, ${pickupLat}]);
                hasBounds = true;
              }

              // Destination Marker
              if (${destinationLng ? 'true' : 'false'}) {
                const destEl = document.createElement('div');
                destEl.className = 'marker-destination';
                new maplibregl.Marker({ element: destEl })
                  .setLngLat([${destinationLng}, ${destinationLat}])
                  .addTo(map);
                
                bounds.extend([${destinationLng}, ${destinationLat}]);
                hasBounds = true;
              }

              // Fit bounds securely if we have two points
              if (hasBounds) {
                map.fitBounds(bounds, { padding: 40, maxZoom: 15 });
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
        originWhitelist={['*']}
        source={{ html: htmlContent }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        startInLoadingState={true}
        renderLoading={() => <ActivityIndicator style={styles.loader} size="large" color="#00B4A0" />}
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
  }
});
