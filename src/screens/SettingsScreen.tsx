import { ChevronRight, LogOut, Mail, User } from 'lucide-react-native';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { NotificationBell, NotificationCenter } from '../components/NotificationCenter';
import type { SettingsStackParamList } from '../navigation/SettingsStack';

function getInitials(value?: string | null) {
  const parts = (value ?? '?').split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2);
  return (parts.join('') || '?').toUpperCase();
}

export function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NavigationProp<SettingsStackParamList>>();
  const { session, logout } = useAuth();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const name = session?.user.name?.trim() || session?.user.email?.trim() || 'User';
  const email = session?.user.email?.trim() || '';
  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out of your account?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void logout() },
    ]);
  };
  return (
    <View style={styles.screen}>
      <View style={[styles.topbar, { paddingTop: insets.top + 10 }]}>
        <View style={styles.topbarCopy}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Account, members, and preferences</Text>
        </View>
        <NotificationBell onOpen={() => setNotificationsOpen(true)} />
      </View>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(name)}</Text>
        </View>
        <View style={styles.copy}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <View style={styles.emailLine}>
            <Mail color="#64748b" size={14} />
            <Text style={styles.email} numberOfLines={1}>{email || 'Account'}</Text>
          </View>
        </View>
      </View>
      <View style={styles.group}>
        <Pressable style={styles.row} onPress={() => navigation.navigate('Profile')}>
          <View style={[styles.rowIcon, { backgroundColor: '#eff6ff' }]}>
            <User color="#2563eb" size={20} />
          </View>
          <View style={styles.copy}>
            <Text style={styles.rowName}>Profile and workspace</Text>
            <Text style={styles.muted}>Account, members, and preferences</Text>
          </View>
          <ChevronRight color="#94a3b8" size={20} />
        </Pressable>
      </View>
      <Pressable style={styles.signOut} onPress={handleSignOut}>
        <LogOut color="#dc2626" size={20} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
      <NotificationCenter visible={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f8fafc', flex: 1, padding: 20 },
  topbar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24, marginHorizontal: -20, paddingBottom: 14, paddingHorizontal: 20 },
  topbarCopy: { flex: 1, minWidth: 0 },
  title: { color: '#0f172a', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#64748b', fontSize: 13, marginTop: 4 },
  profileCard: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, flexDirection: 'row', marginTop: 24, padding: 16 },
  avatar: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  copy: { flex: 1, marginLeft: 12 },
  name: { color: '#0f172a', fontSize: 16, fontWeight: '700' },
  emailLine: { alignItems: 'center', flexDirection: 'row', marginTop: 4 },
  email: { color: '#64748b', flex: 1, fontSize: 13, marginLeft: 4 },
  group: { marginTop: 16 },
  row: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, flexDirection: 'row', padding: 16 },
  rowIcon: { alignItems: 'center', borderRadius: 23, height: 46, justifyContent: 'center', width: 46 },
  rowName: { color: '#0f172a', fontSize: 16, fontWeight: '700' },
  muted: { color: '#64748b', fontSize: 13, marginTop: 4 },
  signOut: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, flexDirection: 'row', justifyContent: 'center', marginTop: 'auto', padding: 16 },
  signOutText: { color: '#dc2626', fontSize: 15, fontWeight: '700', marginLeft: 8 },
});