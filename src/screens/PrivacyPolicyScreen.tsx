import { useNavigation } from '@react-navigation/native';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { ScreenHeader } from '../ui';
import {
  PRIVACY_CONTACT_EMAIL,
  PRIVACY_LAST_UPDATED,
  PRIVACY_POLICY_BLOCKS,
  PRIVACY_POLICY_URL,
  TERMS_URL,
} from '../lib/privacyPolicy';

export function PrivacyPolicyScreen({ onBack }: { onBack?: () => void }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const handleBack = onBack ?? (() => navigation.goBack());

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScreenHeader title="Privacy Policy" subtitle={`Last updated: ${PRIVACY_LAST_UPDATED}`} onBack={handleBack} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {PRIVACY_POLICY_BLOCKS.map((block, index) => {
          if (block.type === 'heading') {
            return (
              <Text key={`h-${index}`} style={[styles.heading, { color: colors.text }]}>
                {block.text}
              </Text>
            );
          }
          if (block.type === 'bullets') {
            return (
              <View key={`b-${index}`} style={styles.bulletList}>
                {block.items.map((item) => (
                  <View key={item.slice(0, 48)} style={styles.bulletRow}>
                    <Text style={[styles.bulletMark, { color: colors.primary }]}>•</Text>
                    <Text style={[styles.body, styles.bulletText, { color: colors.textSecondary }]}>{item}</Text>
                  </View>
                ))}
              </View>
            );
          }
          return (
            <Text key={`p-${index}`} style={[styles.body, { color: colors.textSecondary }]}>
              {block.text}
            </Text>
          );
        })}

        <Pressable onPress={() => void Linking.openURL(`mailto:${PRIVACY_CONTACT_EMAIL}`)}>
          <Text style={[styles.link, { color: colors.primary }]}>Email {PRIVACY_CONTACT_EMAIL}</Text>
        </Pressable>
        <Pressable onPress={() => void Linking.openURL(TERMS_URL)}>
          <Text style={[styles.link, { color: colors.primary }]}>See also our Terms & Conditions</Text>
        </Pressable>
        <Pressable onPress={() => void Linking.openURL(PRIVACY_POLICY_URL)}>
          <Text style={[styles.link, { color: colors.primary }]}>View on zurvis.io</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 20 },
  heading: { fontSize: 17, fontWeight: '800', marginBottom: 8, marginTop: 22 },
  body: { fontSize: 15, lineHeight: 22, marginTop: 4 },
  bulletList: { gap: 10, marginTop: 4 },
  bulletRow: { flexDirection: 'row', gap: 10 },
  bulletMark: { fontSize: 16, lineHeight: 22, marginTop: 1 },
  bulletText: { flex: 1 },
  link: { fontSize: 15, fontWeight: '600', marginTop: 14 },
});
