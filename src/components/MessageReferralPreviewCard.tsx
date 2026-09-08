import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { ExternalLink, Megaphone } from 'lucide-react-native';
import { AuthenticatedImage } from './AuthenticatedImage';
import type { MessageReferralPreview } from '../lib/inbox-utils';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  referral: MessageReferralPreview;
};

export function MessageReferralPreviewCard({ referral }: Props) {
  const { colors, isDark } = useTheme();
  const headline = referral.headline?.trim() ?? '';
  const pageName = referral.pageName?.trim() ?? '';
  const primaryTitle = headline || pageName || 'Ad preview';
  const previewDescription = referral.body?.trim() ?? referral.welcomeMessageText?.trim() ?? null;
  const isVideo = referral.mediaType?.toLowerCase() === 'video';
  const previewImageUrl = isVideo
    ? (referral.thumbnailUrl ?? referral.imageUrl ?? null)
    : (referral.imageUrl ?? referral.thumbnailUrl ?? null);
  const targetUrl = referral.sourceUrl ?? referral.mediaUrl ?? referral.imageUrl ?? null;
  const [imageFailed, setImageFailed] = useState(false);
  const activePreviewImageUrl = previewImageUrl && !imageFailed ? previewImageUrl : null;
  const label = referral.previewLabel.toLowerCase().includes('ad') ? 'From Ads' : 'From Post';

  function openUrl() {
    if (!targetUrl) return;
    Linking.openURL(targetUrl).catch(() => {});
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Megaphone color="#b45309" size={12} />
        <Text style={styles.label}>{label}</Text>
      </View>
      <Pressable
        disabled={!targetUrl}
        onPress={openUrl}
        style={[
          styles.card,
          {
            backgroundColor: isDark ? 'rgba(15,23,42,0.36)' : 'rgba(255,255,255,0.78)',
            borderColor: isDark ? 'rgba(245,158,11,0.32)' : '#f6d78d',
          },
        ]}
      >
        {activePreviewImageUrl ? (
          <AuthenticatedImage
            url={activePreviewImageUrl}
            style={styles.thumbnail}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        ) : null}
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
            {primaryTitle}
          </Text>
          {previewDescription ? (
            <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={2}>
              {previewDescription}
            </Text>
          ) : null}
        </View>
        {targetUrl ? <ExternalLink color={colors.textSecondary} size={14} /> : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  labelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginBottom: 5,
  },
  label: {
    color: '#b45309',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  card: {
    alignItems: 'center',
    borderColor: '#f6d78d',
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
    padding: 6,
    width: '100%',
  },
  thumbnail: {
    backgroundColor: '#f8fafc',
    borderRadius: 7,
    height: 48,
    width: 48,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: '#0f172a',
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 15,
  },
  description: {
    color: '#64748b',
    fontSize: 11,
    lineHeight: 14,
    marginTop: 2,
  },
});
