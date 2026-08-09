import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ExternalLink, Globe } from 'lucide-react-native';
import { fetchLinkPreview, getPreviewableUrl, type LinkPreviewPayload } from '../lib/link-preview';

type Props = {
  url: string;
  /** Kept for call-site compat; preview card is always a white surface. */
  outgoing?: boolean;
};

export function LinkPreviewCard({ url }: Props) {
  const [preview, setPreview] = useState<LinkPreviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const previewUrl = getPreviewableUrl(url);

  useEffect(() => {
    setImageError(false);
    if (!previewUrl) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchLinkPreview(previewUrl)
        .then((result) => {
          if (!cancelled) {
            setPreview(result);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [previewUrl]);

  if (!previewUrl) return null;

  if (loading) {
    return (
      <View style={styles.card}>
        <View style={styles.skeletonImage} />
        <View style={styles.skeletonBody}>
          <View style={skeletonStyles.title} />
          <View style={skeletonStyles.subtitle} />
        </View>
      </View>
    );
  }

  const data = preview ?? {
    url: previewUrl,
    hostname: new URL(previewUrl).hostname,
    title: new URL(previewUrl).hostname.replace(/^www\./, ''),
    description: 'Open this link in a new tab.',
    imageUrl: null,
    siteName: null,
    faviconUrl: null,
    themeColor: null,
    cardType: null,
  };

  const showImage = data.imageUrl && !imageError;
  const hostname = data.hostname.replace(/^www\./, '');

  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => Linking.openURL(data.url).catch(() => {})}
        style={styles.inner}
      >
        {showImage ? (
          <Image
            source={{ uri: data.imageUrl! }}
            style={styles.image}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Globe color="#94a3b8" size={24} />
            {data.siteName ? (
              <Text style={styles.placeholderText}>{data.siteName}</Text>
            ) : null}
          </View>
        )}
        <View style={styles.content}>
          {data.siteName ? (
            <Text style={styles.siteName} numberOfLines={1}>{data.siteName}</Text>
          ) : null}
          <Text style={styles.title} numberOfLines={2}>
            {data.title || hostname}
          </Text>
          {data.description ? (
            <Text style={styles.description} numberOfLines={2}>{data.description}</Text>
          ) : null}
          <View style={styles.footer}>
            <View style={styles.footerLeft}>
              <View style={[styles.themeDot, { backgroundColor: data.themeColor ?? '#64748b' }]} />
              <Text style={styles.hostname} numberOfLines={1}>{hostname}</Text>
            </View>
            <View style={styles.openLink}>
              <Text style={styles.openLinkText}>Open link</Text>
              <ExternalLink color="#22c55e" size={12} />
            </View>
          </View>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    marginTop: 7,
    width: '90%',
  },
  inner: {},
  image: {
    height: 104,
    width: '100%',
    backgroundColor: '#f1f5f9',
  },
  imagePlaceholder: {
    height: 82,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    gap: 6,
  },
  placeholderText: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    backgroundColor: '#ffffff',
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  siteName: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  title: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  description: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 3,
    lineHeight: 13,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  themeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  hostname: {
    color: '#64748b',
    fontSize: 10,
    flex: 1,
  },
  openLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  openLinkText: {
    color: '#22c55e',
    fontSize: 10,
    fontWeight: '600',
  },
  skeletonImage: {
    height: 104,
    backgroundColor: '#f1f5f9',
  },
  skeletonBody: {
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 6,
  },
});

const skeletonStyles = StyleSheet.create({
  title: {
    height: 14,
    borderRadius: 4,
    backgroundColor: '#e2e8f0',
    width: '70%',
  },
  subtitle: {
    height: 11,
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
    width: '50%',
  },
});
