import { useState } from 'react';
import { FlatList, ScrollView, StyleSheet, View } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChannelLogo } from '../components/ChannelLogo';
import type { ChannelsStackParamList } from '../navigation/ChannelsStack';
import { useTheme } from '../theme/ThemeContext';
import { spacing } from '../theme/tokens';
import { AppBadge, AppButton, AppCard, AppChip, AppSearchField, AppText, EmptyState, ScreenHeader } from '../ui';

const categories = ['All', 'Business Messaging', 'Calls', 'SMS', 'Email', 'Live Chat'] as const;
type Category = typeof categories[number];
type CatalogItem = { id: string; name: string; description: string; type: string; category: Category; badge?: 'Popular' | 'New'; comingSoon?: boolean };
const catalog: CatalogItem[] = [
  { id: 'whatsapp', name: 'WhatsApp Business Platform (API)', description: 'Connect WhatsApp Business API to enable seamless conversations.', type: 'WHATSAPP', category: 'Business Messaging', badge: 'Popular' },
  { id: 'whatsapp-manual', name: 'WhatsApp Manual Setup', description: 'Connect via Meta Cloud API with Phone Number ID and Access Token.', type: 'WHATSAPP', category: 'Business Messaging' },
  { id: 'messenger-business', name: 'Messenger — Business Manager', description: 'Connect a Page through Meta Business Manager.', type: 'MESSENGER', category: 'Business Messaging', badge: 'Popular' },
  { id: 'instagram', name: 'Instagram', description: 'Reply to private messages and build a strong brand presence.', type: 'INSTAGRAM', category: 'Business Messaging', badge: 'New' },
  { id: 'tiktok', name: 'TikTok', description: 'Connect a TikTok account to manage conversations with your audience.', type: 'TIKTOK', category: 'Business Messaging', badge: 'New' },
  { id: 'webchat', name: 'Chat Widget', description: 'Add a branded live chat widget to your website.', type: 'WEBCHAT', category: 'Live Chat', badge: 'New' },
  { id: 'telegram', name: 'Telegram', description: 'Connect a Telegram Bot to provide real-time support to customers.', type: 'TELEGRAM', category: 'Business Messaging', comingSoon: true },
  { id: 'email', name: 'Email', description: 'Connect your shared inbox to handle email conversations.', type: 'EMAIL', category: 'Email', comingSoon: true },
  { id: 'voice', name: 'Voice Calls', description: 'Enable voice-first customer conversations and call routing.', type: 'CALLS', category: 'Calls', comingSoon: true },
  { id: 'messenger-manual', name: 'Messenger — Manual', description: 'Connect a Page with a user access token, even without a Business Manager.', type: 'MESSENGER', category: 'Business Messaging' },
];

export function ChannelCatalogScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ChannelsStackParamList>>();
  const { colors } = useTheme();
  const [category, setCategory] = useState<Category>('All');
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();
  const items = catalog.filter(item => (category === 'All' || item.category === category) && `${item.name} ${item.description}`.toLowerCase().includes(query));
  return <View style={[styles.screen, { backgroundColor: colors.background }]}>
    <ScreenHeader title="Channel Catalog" subtitle="Discover new channels to acquire more customers." onBack={() => navigation.goBack()} />
    <View style={styles.search}><AppSearchField value={search} onChangeText={setSearch} placeholder="Search channels..." fill={false} /></View>
    <View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories}>
      {categories.map(value => <AppChip key={value} label={value} selected={category === value} onPress={() => setCategory(value)} />)}
    </ScrollView></View>
    <FlatList data={items} keyExtractor={item => item.id} contentContainerStyle={styles.list}
      ListEmptyComponent={<EmptyState title="No matching channels" message="Try another search or category." />}
      renderItem={({ item }) => {
        const available = item.id === 'whatsapp-manual' || item.id === 'messenger-manual' || item.id === 'messenger-business';
        return <AppCard padding="none" style={styles.card}>
          <View style={styles.body}>
            <ChannelLogo type={item.type} box={48} glyph={24} radius={24} />
            <View style={styles.copy}>
              <View style={styles.title}><AppText variant="bodyStrong" style={styles.copy}>{item.name}</AppText>{item.badge ? <AppBadge label={item.badge} tone={item.badge === 'Popular' ? 'success' : 'warning'} /> : null}</View>
              <AppText variant="caption" tone="secondary">{item.description}</AppText>
            </View>
          </View>
          <View style={[styles.footer, { borderTopColor: colors.cardBorder }]}>
            <AppText variant="tiny" tone="muted" style={styles.copy}>{item.category.toUpperCase()}</AppText>
            <AppButton label={available ? 'Connect' : item.comingSoon ? 'Coming soon' : 'Available on web'} variant="secondary" size="sm" icon={available ? ChevronRight : undefined} disabled={!available} onPress={() => item.id.startsWith('messenger-') ? navigation.navigate('ConnectMessenger', { mode: item.id === 'messenger-business' ? 'business_manager' : 'user_access_token' }) : navigation.navigate('ConnectWhatsAppManual')} />
          </View>
        </AppCard>;
      }} />
  </View>;
}
const styles = StyleSheet.create({
  screen: { flex: 1 }, search: { padding: spacing.lg }, categories: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg, gap: spacing.sm },
  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md }, card: { overflow: 'hidden' },
  body: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg }, copy: { flex: 1, minWidth: 0 },
  title: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  footer: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderTopWidth: StyleSheet.hairlineWidth },
});
