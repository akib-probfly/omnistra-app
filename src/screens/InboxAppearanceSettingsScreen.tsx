import { LinearGradient } from 'expo-linear-gradient';
import { Check, Palette } from 'lucide-react-native';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { AppToggle } from '../components/AppToggle';
import { ColorfulAvatar } from '../components/ColorfulAvatar';
import { useInboxAppearance } from '../hooks/useInboxAppearance';
import { INBOX_PATTERNS, type InboxPatternId } from '../lib/inbox-patterns';
import { AppCard, AppText, ScreenHeader } from '../ui';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';

export function InboxAppearanceSettingsScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const {
    pattern,
    channelSpecific,
    colorfulAvatars,
    setPattern,
    setChannelSpecific,
    setColorfulAvatars,
  } = useInboxAppearance();

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Inbox Appearance"
        subtitle="Choose a background pattern for the inbox thread."
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <AppText variant="tiny" tone="secondary" style={styles.sectionLabel}>Pattern</AppText>
        <View style={styles.patternGrid}>
          {INBOX_PATTERNS.map((item) => {
            const selected = item.id === pattern;
            return (
              <Pressable
                key={item.id}
                style={styles.patternItem}
                onPress={() => setPattern(item.id as InboxPatternId)}
              >
                <View style={[styles.patternPreview, { borderColor: colors.cardBorder }, selected && { borderColor: colors.primary, borderWidth: 2 }]}>
                  {item.thumbSource ? (
                    <Image source={item.thumbSource} style={styles.patternImage} resizeMode="cover" />
                  ) : (
                    <LinearGradient
                      colors={item.previewColors as [string, string, ...string[]]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  {selected ? (
                    <View style={[styles.checkBadge, { backgroundColor: colors.primary }]}>
                      <Check color={colors.primaryText} size={14} strokeWidth={3} />
                    </View>
                  ) : null}
                </View>
                <AppText variant="caption" tone={selected ? 'primary' : 'secondary'} style={styles.patternLabel}>{item.label}</AppText>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => setChannelSpecific(!channelSpecific)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: channelSpecific }}
        >
          <AppCard padding="md" style={styles.checkboxCard}>
            <View style={[styles.checkbox, { borderColor: colors.cardBorder }, channelSpecific && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              {channelSpecific ? <Check color={colors.primaryText} size={14} strokeWidth={3} /> : null}
            </View>
            <View style={styles.checkboxCopy}>
              <AppText variant="bodyStrong">Channel specific background</AppText>
              <AppText variant="caption" tone="secondary" style={styles.checkboxBody}>
                By selecting this checkbox, channel specific backgrounds will override the selected pattern.
              </AppText>
            </View>
          </AppCard>
        </Pressable>

        <AppText variant="tiny" tone="secondary" style={[styles.sectionLabel, styles.sectionSpacer]}>User Avatars</AppText>
        <AppCard padding="md" style={styles.avatarCard}>
          <View style={styles.avatarStack}>
            <ColorfulAvatar name="Maria A" size={40} />
            <View style={styles.avatarOverlap}>
              <ColorfulAvatar name="James A" size={40} />
            </View>
            <View style={styles.avatarOverlap}>
              <ColorfulAvatar name="Sarah H" size={40} />
            </View>
          </View>
          <View style={styles.avatarCopy}>
            <View style={styles.avatarTitleRow}>
              <Palette color={colors.primary} size={16} />
              <AppText variant="caption" style={styles.avatarTitle}>Colorful avatars</AppText>
            </View>
            <AppText variant="small" tone="secondary" style={styles.avatarBody}>
              Replace plain initials with vibrant generated avatars in the inbox, conversation list and call log.
            </AppText>
          </View>
          <AppToggle
            value={colorfulAvatars}
            onValueChange={setColorfulAvatars}
            accessibilityLabel="Colorful avatars"
          />
        </AppCard>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: spacing.xxl },
  sectionLabel: {
    letterSpacing: 0.4,
    marginBottom: spacing.md,
    textTransform: 'uppercase',
  },
  sectionSpacer: { marginTop: spacing.xxxl - spacing.xs },
  patternGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    justifyContent: 'space-between',
  },
  patternItem: { width: '48%' },
  patternPreview: {
    borderRadius: radius.xl,
    borderWidth: 1,
    height: 96,
    overflow: 'hidden',
  },
  patternImage: {
    height: '100%',
    width: '100%',
  },
  checkBadge: {
    alignItems: 'center',
    backgroundColor: '#2563eb',
    borderRadius: radius.md,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 24,
  },
  patternLabel: {
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  checkboxCard: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  checkbox: {
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    height: spacing.xl,
    justifyContent: 'center',
    marginTop: 2,
    width: spacing.xl,
  },
  checkboxCopy: { flex: 1, minWidth: 0 },
  checkboxBody: { lineHeight: fontSize.caption + spacing.xs, marginTop: spacing.xs },
  avatarCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.md,
  },
  avatarStack: { alignItems: 'center', flexDirection: 'row' },
  avatarOverlap: { marginLeft: -8 },
  avatarCopy: { flex: 1, minWidth: 0 },
  avatarTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  avatarTitle: { fontWeight: fontWeight.bold },
  avatarBody: { marginTop: spacing.xs, lineHeight: fontSize.small + spacing.xs },
});
