import React, { useEffect, useState } from 'react';
import {
  View,
  Image,
  Text,
  StyleProp,
  ImageStyle,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { authService } from '@/api/authService';
import { useThemeColors } from '@/hooks/useThemeColors';

type Props = {
  uri?: string | null;
  size?: number;
  initials?: string;
  style?: StyleProp<ImageStyle | ViewStyle>;
  initialsStyle?: StyleProp<TextStyle>;
};

/**
 * Renders a profile photo. Private S3 URLs are resolved to short-lived signed URLs.
 * Local file:// URIs and already-signed https URLs are shown directly.
 */
export function ProfileAvatar({
  uri,
  size = 80,
  initials = '?',
  style,
  initialsStyle,
}: Props) {
  const colors = useThemeColors();
  const [displayUri, setDisplayUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!uri) {
      setDisplayUri(null);
      return;
    }

    // Local picker / camera URI — no signing needed
    if (!uri.startsWith('http')) {
      setDisplayUri(uri);
      return;
    }

    // Already a signed URL (has X-Amz- or Signature query)
    if (/[?&](X-Amz-Signature|Signature)=/i.test(uri)) {
      setDisplayUri(uri);
      return;
    }

    setDisplayUri(null);
    (async () => {
      try {
        const signed = await authService.getMediaUrl(uri);
        if (!cancelled) setDisplayUri(signed || uri);
      } catch {
        if (!cancelled) setDisplayUri(uri);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [uri]);

  const radius = size / 2;

  if (displayUri) {
    return (
      <Image
        source={{ uri: displayUri }}
        style={[
          {
            width: size,
            height: size,
            borderRadius: radius,
            backgroundColor: colors.surfaceAlt,
          },
          style as StyleProp<ImageStyle>,
        ]}
        resizeMode="cover"
      />
    );
  }

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: colors.electricTeal,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style as StyleProp<ViewStyle>,
      ]}
    >
      <Text
        style={[
          {
            color: '#FFF',
            fontSize: size * 0.36,
            fontWeight: '700',
          },
          initialsStyle,
        ]}
      >
        {initials}
      </Text>
    </View>
  );
}
