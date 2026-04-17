import React, { useEffect } from 'react';
import { StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  runOnJS,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';
import { COLORS } from '@/constants/theme';

interface AnimatedSplashScreenProps {
  onAnimationComplete: () => void;
}

const { width, height } = Dimensions.get('window');

export function AnimatedSplashScreen({ onAnimationComplete }: AnimatedSplashScreenProps) {
  const opacity = useSharedValue(1);
  const scale = useSharedValue(0.8);

  useEffect(() => {
    // Hide the native splash screen as soon as this component mounts
    SplashScreen.hideAsync().catch(() => {
      // Ignore if already hidden
    });

    // Start the animation sequence
    scale.value = withTiming(1, { duration: 1000, easing: Easing.out(Easing.exp) });
    
    opacity.value = withDelay(
      4000, // keep the image visible for 4 seconds
      withTiming(0, { duration: 500 }, (finished) => {
        if (finished) {
          runOnJS(onAnimationComplete)();
        }
      })
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: opacity.value,
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <Animated.View style={[styles.container, { opacity: opacity }]}>
      <Animated.Image
        source={require('../../assets/images/anime.png')}
        style={[styles.image, animatedStyle]}
        resizeMode="cover"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#002B49', // A dark premium background matching 'anime.png' vibes or standard theme
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
  image: {
    width: width,
    height: height,
  },
});
