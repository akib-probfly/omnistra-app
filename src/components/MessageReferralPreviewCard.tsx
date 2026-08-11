import { useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Play } from 'lucide-react-native';
import { AuthenticatedImage } from './AuthenticatedImage';
import type { MessageReferralPreview } from '../lib/inbox-utils';

type Props = {
  referral: MessageReferralPreview;
};

export function MessageReferralPreviewCard({ referral }: Props) {
  const hasHeadline = Boolean(referral.headline?.trim());
  const hasPageName = Boolean(referral.pageName?.trim());
  const hasWelcomeMessage = Boolean(referral.welcomeMessageText?.trim());
  const primaryTitle = hasPageName ? referral.pageName : hasHeadline ? referral.headline : null;
  const secondaryHeadline =
    hasPageName
    && hasHeadline
    && referral.pageName?.trim().toLowerCase() !== referral.headline?.trim().toLowerCase()
      ? referral.headline
      : null;
  const previewDescription = referral.body?.trim() ?? referral.welcomeMessageText?.trim() ?? null;
  const isVideo = referral.mediaType?.toLowerCase() === 'video';
  const previewImageUrl = isVideo
    ? (referral.thumbnailUrl ?? referral.imageUrl ?? null)
    : (referral.imageUrl ?? referral.thumbnailUrl ?? null);
  const previewMediaUrl = referral.mediaUrl ?? referral.imageUrl ?? null;
  const [imageFailed, setImageFailed] = useState(false);
  const activePreviewImageUrl = previewImageUrl && !imageFailed ? previewImageUrl : null;
  const showImagePreview = Boolean(activePreviewImageUrl) && !isVideo;
  const showVideoPreview = isVideo;

  function openUrl(url?: string | null) {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  }

  return (
    <View style={styles.card}>
      {showImagePreview ? (
        <View style={styles.mediaWrap}>
          <AuthenticatedImage
            url={activePreviewImageUrl!}
            style={styles.mediaImage}
            resizeMode="cover"
            onError={() => setImageFailed(true)}
          />
        </View>
      ) : null}

      {showVideoPreview ? (
        activePreviewImageUrl ? (
          <Pressable
            onPress={() => openUrl(previewMediaUrl)}
            style={styles.videoWrap}
            disabled={!previewMediaUrl}
          >
            <AuthenticatedImage
              url={activePreviewImageUrl}
              style={styles.mediaImage}
              resizeMode="cover"
              onError={() => setImageFailed(true)}
            />
            <View style={styles.videoScrim} />
            <View style={styles.playCircle}>
              <Play color="#fff" fill="#fff" size={22} />
            </View>
            <View style={styles.videoLabel}>
              <Text style={styles.videoLabelEyebrow}>{referral.previewLabel}</Text>
              <Text style={styles.videoLabelTitle}>Video ad preview</Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.videoFallback}>
            <View style={styles.playCircleMuted}>
              <Play color="#fff" fill="#fff" size={18} />
            </View>
            <View style={styles.videoFallbackText}>
              <Text style={styles.videoLabelEyebrow}>{referral.previewLabel}</Text>
              <Text style={styles.videoLabelTitle}>Video ad preview</Text>
            </View>
          </View>
        )
      ) : null}

      <View style={styles.body}>
        <Text style={styles.previewLabel}>{referral.previewLabel}</Text>
        {primaryTitle ? (
          <Text style={styles.primaryTitle} numberOfLines={2}>{primaryTitle}</Text>
        ) : null}
        {secondaryHeadline ? (
          <Text style={styles.secondaryHeadline} numberOfLines={2}>{secondaryHeadline}</Text>
        ) : null}
        {previewDescription ? (
          <Text style={styles.description} numberOfLines={3}>{previewDescription}</Text>
        ) : null}
        {hasWelcomeMessage ? (
          <Text style={styles.welcome}>{referral.welcomeMessageText}</Text>
        ) : null}
        {referral.sourceUrl ? (
          <Pressable onPress={() => openUrl(referral.sourceUrl)} hitSlop={6} style={styles.viewAd}>
            <Text style={styles.viewAdText}>View ad</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderColor: '#e2e8f0',
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    width: '100%',
  },
  mediaWrap: {
    backgroundColor: '#f8fafc',
    borderBottomColor: 'rgba(226,232,240,0.7)',
    borderBottomWidth: 1,
  },
  mediaImage: {
    backgroundColor: '#0f172a',
    height: 160,
    width: '100%',
  },
  videoWrap: {
    backgroundColor: '#0f172a',
    borderBottomColor: 'rgba(226,232,240,0.7)',
    borderBottomWidth: 1,
  },
  videoScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  playCircle: {
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    left: '50%',
    marginLeft: -28,
    marginTop: -28,
    position: 'absolute',
    top: '50%',
    width: 56,
  },
  videoLabel: {
    left: 16,
    position: 'absolute',
    top: 16,
  },
  videoLabelEyebrow: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  videoLabelTitle: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 4,
  },
  videoFallback: {
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderBottomColor: 'rgba(226,232,240,0.7)',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  playCircleMuted: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  videoFallbackText: { flex: 1, minWidth: 0 },
  body: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  previewLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  primaryTitle: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
    marginTop: 4,
  },
  secondaryHeadline: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17,
    marginTop: 4,
  },
  description: {
    color: '#475569',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
  },
  welcome: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 8,
  },
  viewAd: {
    alignSelf: 'flex-start',
    marginTop: 10,
  },
  viewAdText: {
    color: '#315efb',
    fontSize: 11,
    fontWeight: '600',
  },
});
