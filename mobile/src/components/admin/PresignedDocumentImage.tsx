import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Dimensions,
  StatusBar,
  Platform,
  Pressable,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { adminApi } from '@/api';
import { SPACING, BORDER_RADIUS, FONT_SIZES, FONT_WEIGHTS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export function looksLikeImage(url: string): boolean {
  if (!url) return false;
  const path = url.split('?')[0].toLowerCase();
  return /\.(jpg|jpeg|png|gif|webp)$/.test(path);
}

export function looksLikePdf(url: string): boolean {
  if (!url) return false;
  return /\.pdf($|\?)/i.test(url);
}

type ViewerProps = {
  visible: boolean;
  sourceUrl: string | null;
  title?: string;
  onClose: () => void;
};

/**
 * Full-screen in-app viewer for private S3 docs (images + PDFs).
 * Close/back controls stay above the image/WebView so admins can always exit.
 */
export function DocumentViewerModal({ visible, sourceUrl, title, onClose }: ViewerProps) {
  const colors = useThemeColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeViewerStyles(colors), [colors]);
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !sourceUrl) {
      setPresignedUrl(null);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setPresignedUrl(null);

    (async () => {
      try {
        const res = await adminApi.getPresignedUrl(sourceUrl);
        const signed = res.data?.url || sourceUrl;
        if (!cancelled) {
          setPresignedUrl(signed);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load document');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible, sourceUrl]);

  const isImage =
    !!sourceUrl &&
    (looksLikeImage(sourceUrl) || (!!presignedUrl && looksLikeImage(presignedUrl)));
  const isPdf =
    !!sourceUrl &&
    (looksLikePdf(sourceUrl) || (!!presignedUrl && looksLikePdf(presignedUrl)));

  const headerPad = Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight || 12 : 12);
  const footerPad = Math.max(insets.bottom, 12);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor="#0B1220" />
      <View style={styles.root}>
        {/* Sticky top bar — always above WebView/image */}
        <View style={[styles.topBar, { paddingTop: headerPad }]}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.backBtn, pressed && styles.btnPressed]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <Ionicons name="arrow-back" size={22} color="#FFF" />
            <Text style={styles.backBtnText}>Back</Text>
          </Pressable>

          <Text style={styles.viewerTitle} numberOfLines={1}>
            {title || 'Document'}
          </Text>

          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.closeBtn, pressed && styles.btnPressed]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close document"
          >
            <Ionicons name="close" size={24} color="#FFF" />
          </Pressable>
        </View>

        <View style={styles.viewerBody}>
          {loading && (
            <View style={styles.centered}>
              <ActivityIndicator size="large" color={colors.electricTeal} />
              <Text style={styles.loadingText}>Loading document…</Text>
            </View>
          )}

          {!loading && error && (
            <View style={styles.centered}>
              <Ionicons name="alert-circle-outline" size={40} color={colors.error} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.errorCloseBtn} onPress={onClose}>
                <Text style={styles.errorCloseText}>Go back</Text>
              </TouchableOpacity>
            </View>
          )}

          {!loading && !error && presignedUrl && isImage && (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              maximumZoomScale={4}
              minimumZoomScale={1}
              centerContent
              showsHorizontalScrollIndicator={false}
              showsVerticalScrollIndicator={false}
            >
              <Image
                source={{ uri: presignedUrl }}
                style={styles.fullImage}
                resizeMode="contain"
                onError={() => setError('Image failed to display')}
              />
            </ScrollView>
          )}

          {!loading && !error && presignedUrl && !isImage && (
            <WebView
              source={{
                uri:
                  isPdf && Platform.OS === 'android'
                    ? `https://docs.google.com/gview?embedded=true&url=${encodeURIComponent(presignedUrl)}`
                    : presignedUrl,
              }}
              style={styles.webview}
              startInLoadingState
              renderLoading={() => (
                <View style={styles.webviewLoading}>
                  <ActivityIndicator size="large" color={colors.electricTeal} />
                </View>
              )}
              allowsFullscreenVideo={false}
              originWhitelist={['*']}
              setSupportMultipleWindows={false}
              mixedContentMode="always"
            />
          )}
        </View>

        {/* Bottom close — backup if top controls are hard to reach */}
        <View style={[styles.bottomBar, { paddingBottom: footerPad }]}>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.bottomCloseBtn, pressed && styles.btnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Close and go back"
          >
            <Ionicons name="arrow-back" size={18} color="#0B1220" />
            <Text style={styles.bottomCloseText}>Close document</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

type PreviewProps = {
  url: string;
  label?: string;
  height?: number;
};

/**
 * Inline preview that opens the in-app DocumentViewerModal on tap.
 */
export function PresignedDocumentImage({ url, label, height = 200 }: PreviewProps) {
  const colors = useThemeColors();
  const styles = useMemo(() => makePreviewStyles(colors, height), [colors, height]);
  const [presignedUrl, setPresignedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewerOpen, setViewerOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPresignedUrl(null);

    (async () => {
      try {
        const res = await adminApi.getPresignedUrl(url);
        const signed = res.data?.url || url;
        if (!cancelled) {
          setPresignedUrl(signed);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load document');
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  const viewer = (
    <DocumentViewerModal
      visible={viewerOpen}
      sourceUrl={url}
      title={label}
      onClose={() => setViewerOpen(false)}
    />
  );

  if (loading) {
    return (
      <View style={styles.box}>
        <ActivityIndicator size="small" color={colors.electricTeal} />
        <Text style={styles.hint}>{label ? `Loading ${label}…` : 'Loading document…'}</Text>
      </View>
    );
  }

  if (error || !presignedUrl) {
    return (
      <>
        <TouchableOpacity style={[styles.box, styles.errorBox]} onPress={() => setViewerOpen(true)}>
          <Ionicons name="alert-circle-outline" size={28} color={colors.error} />
          <Text style={styles.errorText}>{error || 'Could not load document'}</Text>
          <Text style={styles.hint}>Tap to open viewer</Text>
        </TouchableOpacity>
        {viewer}
      </>
    );
  }

  if (!looksLikeImage(url) && !looksLikeImage(presignedUrl)) {
    return (
      <>
        <TouchableOpacity style={styles.pdfButton} onPress={() => setViewerOpen(true)}>
          <Ionicons name="document-attach-outline" size={24} color={colors.info} />
          <Text style={styles.pdfText}>{label || 'View Document'}</Text>
        </TouchableOpacity>
        {viewer}
      </>
    );
  }

  return (
    <>
      <TouchableOpacity onPress={() => setViewerOpen(true)} activeOpacity={0.85}>
        <Image
          source={{ uri: presignedUrl }}
          style={styles.image}
          resizeMode="contain"
          onError={() => setError('Image failed to display')}
        />
        <Text style={styles.hint}>Tap to view full size in app</Text>
      </TouchableOpacity>
      {viewer}
    </>
  );
}

const makeViewerStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: '#0B1220',
    },
    topBar: {
      zIndex: 20,
      elevation: 20,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: SPACING.sm,
      paddingBottom: SPACING.sm,
      backgroundColor: '#0B1220',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: 'rgba(255,255,255,0.12)',
      gap: SPACING.xs,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: 'rgba(255,255,255,0.14)',
    },
    backBtnText: {
      color: '#FFF',
      fontSize: 15,
      fontWeight: FONT_WEIGHTS.semibold,
    },
    viewerTitle: {
      flex: 1,
      color: '#FFF',
      fontSize: FONT_SIZES.label,
      fontWeight: FONT_WEIGHTS.semibold,
      textAlign: 'center',
      marginHorizontal: SPACING.xs,
    },
    closeBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: 'rgba(255,255,255,0.14)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    btnPressed: {
      opacity: 0.7,
    },
    viewerBody: {
      flex: 1,
      backgroundColor: '#000',
      zIndex: 1,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: SPACING.xl,
      gap: SPACING.sm,
    },
    loadingText: {
      color: colors.textSecondary,
      marginTop: SPACING.sm,
    },
    errorText: {
      color: colors.error,
      textAlign: 'center',
      fontSize: FONT_SIZES.label,
    },
    errorCloseBtn: {
      marginTop: SPACING.md,
      paddingHorizontal: SPACING.lg,
      paddingVertical: SPACING.sm,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.electricTeal,
    },
    errorCloseText: {
      color: '#FFF',
      fontWeight: FONT_WEIGHTS.semibold,
    },
    scroll: { flex: 1 },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: SCREEN_HEIGHT * 0.55,
    },
    fullImage: {
      width: SCREEN_WIDTH,
      height: SCREEN_HEIGHT * 0.65,
    },
    webview: {
      flex: 1,
      backgroundColor: '#FFF',
    },
    webviewLoading: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#0B1220',
    },
    bottomBar: {
      zIndex: 20,
      elevation: 20,
      paddingTop: SPACING.sm,
      paddingHorizontal: SPACING.lg,
      backgroundColor: '#0B1220',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: 'rgba(255,255,255,0.12)',
    },
    bottomCloseBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      backgroundColor: '#FFF',
      paddingVertical: 14,
      borderRadius: BORDER_RADIUS.md,
    },
    bottomCloseText: {
      color: '#0B1220',
      fontSize: FONT_SIZES.body,
      fontWeight: FONT_WEIGHTS.bold,
    },
  });

const makePreviewStyles = (colors: ThemeColors, height: number) =>
  StyleSheet.create({
    box: {
      height,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
      justifyContent: 'center',
      alignItems: 'center',
      padding: SPACING.md,
      gap: SPACING.xs,
    },
    errorBox: {
      borderColor: `${colors.error}55`,
      backgroundColor: `${colors.error}08`,
    },
    image: {
      width: '100%',
      height,
      borderRadius: BORDER_RADIUS.md,
      backgroundColor: colors.surfaceAlt,
      borderWidth: 1,
      borderColor: colors.border,
    },
    hint: {
      marginTop: SPACING.xs,
      color: colors.textTertiary,
      fontSize: FONT_SIZES.small,
      textAlign: 'center',
    },
    errorText: {
      color: colors.error,
      fontSize: FONT_SIZES.small,
      textAlign: 'center',
      fontWeight: FONT_WEIGHTS.medium,
    },
    pdfButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: SPACING.sm,
      paddingVertical: SPACING.md,
      borderRadius: BORDER_RADIUS.md,
      borderWidth: 1,
      borderColor: colors.info,
      backgroundColor: `${colors.info}08`,
    },
    pdfText: {
      color: colors.info,
      fontSize: FONT_SIZES.label,
      fontWeight: FONT_WEIGHTS.semibold,
    },
  });
