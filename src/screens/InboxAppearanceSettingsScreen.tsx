import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Check, Palette } from 'lucide-react-native';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { AppToggle } from '../components/AppToggle';
import { ColorfulAvatar } from '../components/ColorfulAvatar';
import { useInboxAppearance } from '../hooks/useInboxAppearance';
import { INBOX_PATTERNS, type InboxPatternId } from '../lib/inbox-patterns';

export function InboxAppearanceSettingsScreen() {
  const insets = useSafeAreaInsets();
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
      <View style={[styles.header, { paddingTop: insets.top + 10, backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
          <ArrowLeft color={colors.text} size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Inbox Appearance</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Choose a background pattern for the inbox thread.</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Pattern</Text>
        <View style={styles.patternGrid}>
          {INBOX_PATTERNS.map((item) => {
            const selected = item.id === pattern;
            return (
              <Pressable
                key={item.id}
                style={styles.patternItem}
                onPress={() => setPattern(item.id as InboxPatternId)}
              >
                <View style={[styles.patternPreview, { borderColor: colors.cardBorder }, selected && styles.patternPreviewSelected]}>
                  {item.thumbSource ? (
                    <Image source={item.thumbSource} style={styles.patternImage} resizeMode="cover" />
                  ) : (
                    <LinearGradient
                      colors={item.previewColors as [string, string, ...string[]]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFillObject}
                    />
                  )}
                  {selected ? (
                    <View style={styles.checkBadge}>
                      <Check color="#fff" size={14} strokeWidth={3} />
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.patternLabel, { color: colors.textSecondary }, selected && styles.patternLabelSelected]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          style={[styles.checkboxCard, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}
          onPress={() => setChannelSpecific(!channelSpecific)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: channelSpecific }}
        >
          <View style={[styles.checkbox, { backgroundColor: colors.surface, borderColor: colors.cardBorder }, channelSpecific && styles.checkboxOn]}>
            {channelSpecific ? <Check color="#fff" size={14} strokeWidth={3} /> : null}
          </View>
          <View style={styles.checkboxCopy}>
            <Text style={[styles.checkboxTitle, { color: colors.text }]}>Channel specific background</Text>
            <Text style={[styles.checkboxBody, { color: colors.textSecondary }]}>
              By selecting this checkbox, channel specific backgrounds will override the selected pattern.
            </Text>
          </View>
        </Pressable>

        <Text style={[styles.sectionLabel, styles.sectionSpacer, { color: colors.textSecondary }]}>User Avatars</Text>
        <View style={[styles.avatarCard, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
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
              <Text style={[styles.avatarTitle, { color: colors.text }]}>Colorful avatars</Text>
            </View>
            <Text style={[styles.avatarBody, { color: colors.textSecondary }]}>
              Replace plain initials with vibrant generated avatars in the inbox, conversation list and call log.
            </Text>
          </View>
          <AppToggle
            value={colorfulAvatars}
            onValueChange={setColorfulAvatars}
            accessibilityLabel="Colorful avatars"
          />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 12,
    paddingHorizontal: 14,
  },
  backButton: {
    alignItems: 'center',
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { fontSize: 20, fontWeight: '800' },
  headerSubtitle: { fontSize: 13, marginTop: 2 },
  content: { paddingHorizontal: 16, paddingTop: 18 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  sectionSpacer: { marginTop: 28 },
  patternGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  patternItem: { width: '48%' },
  patternPreview: {
    borderRadius: 16,
    borderWidth: 1,
    height: 96,
    overflow: 'hidden',
  },
  patternPreviewSelected: {
    borderColor: '#2B6BFF',
    borderWidth: 2,
  },
  patternImage: {
    height: '100%',
    width: '100%',
  },
  checkBadge: {
    alignItems: 'center',
    backgroundColor: '#2B6BFF',
    borderRadius: 12,
    height: 24,
    justifyContent: 'center',
    position: 'absolute',
    right: 8,
    top: 8,
    width: 24,
  },
  patternLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  patternLabelSelected: { color: '#2B6BFF' },
  checkboxCard: {
    alignItems: 'flex-start',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
    padding: 14,
  },
  checkbox: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 22,
    justifyContent: 'center',
    marginTop: 2,
    width: 22,
  },
  checkboxOn: {
    backgroundColor: '#2B6BFF',
    borderColor: '#2B6BFF',
  },
  checkboxCopy: { flex: 1, minWidth: 0 },
  checkboxTitle: { fontSize: 15, fontWeight: '700' },
  checkboxBody: { fontSize: 13, lineHeight: 18, marginTop: 4 },
  avatarCard: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  avatarStack: { alignItems: 'center', flexDirection: 'row' },
  avatarOverlap: { marginLeft: -8 },
  avatarCopy: { flex: 1, minWidth: 0 },
  avatarTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  avatarTitle: { fontSize: 14, fontWeight: '700' },
  avatarBody: { fontSize: 12, lineHeight: 17, marginTop: 4 },
});
