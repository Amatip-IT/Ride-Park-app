const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Stub out native-only modules when bundling for web
config.resolver = {
  ...config.resolver,
  resolveRequest: (context, moduleName, platform) => {
    if (platform === 'web' && moduleName === '@stripe/stripe-react-native') {
      // Return an empty stub so the web bundle doesn't crash
      return {
        filePath: require.resolve('./src/utils/stubs/stripe-stub.js'),
        type: 'sourceFile',
      };
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
