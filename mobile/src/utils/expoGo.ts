import Constants from 'expo-constants';

/** True when the JS is running inside the Expo Go app (not a custom build). */
export function isExpoGo(): boolean {
  return (
    Constants.appOwnership === 'expo' ||
    Constants.executionEnvironment === 'storeClient'
  );
}
