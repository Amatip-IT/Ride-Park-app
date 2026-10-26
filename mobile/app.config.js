/**
 * Extends app.json with plugins that app.json can't express.
 * Maps render with MapLibre using Amazon Location styles (EXPO_PUBLIC_AWS_LOCATION_KEY).
 */
module.exports = ({ config }) => ({
  ...config,
  plugins: [...(config.plugins || []), '@maplibre/maplibre-react-native'],
});
