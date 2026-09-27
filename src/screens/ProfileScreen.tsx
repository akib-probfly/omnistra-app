import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Camera, Eye, EyeOff, Lock, Save } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { showNotice } from '../components/AppToast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, inputHeight, radius, spacing } from '../theme/tokens';
import { apiUrl } from '../api/client';
import { fetchMyProfile, updateMyProfile } from '../api/profile';
import { useAuth } from '../auth/AuthContext';
import { AppButton, AppTextField } from '../ui';

function getInitials(value?: string | null) {
  const parts = (value ?? '?').split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2);
  return (parts.join('') || '?').toUpperCase();
}

const PASSWORD_RULES = 'Use 8–128 characters with at least one letter and one number.';

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const { session, updateUser } = useAuth();
  const currentName = session?.user.name?.trim() || session?.user.email?.trim() || 'User';
  const initialAvatarUrl = session?.user.avatarUrl ?? null;

  const [nameOverride, setNameOverride] = useState<string | null>(null);
  const [avatarPreviewUri, setAvatarPreviewUri] = useState<string | null>(null);
  const [avatarAsset, setAvatarAsset] = useState<{ uri: string; name: string; mimeType: string } | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);

  const profileQuery = useQuery({
    queryKey: ['user-profile', 'me'],
    queryFn: fetchMyProfile,
    enabled: Boolean(session?.user.email),
  });

  const profileDisplayName = profileQuery.data?.name?.trim() || profileQuery.data?.email?.trim() || currentName;
  const displayName = nameOverride ?? profileDisplayName;
  const storedAvatarUrl = profileQuery.data?.avatarUrl ?? initialAvatarUrl;
  const displayAvatarUrl = avatarPreviewUri ?? (storedAvatarUrl ? apiUrl(storedAvatarUrl) : null);

  const hasProfileChanges = displayName.trim() !== profileDisplayName || avatarAsset !== null;
  const hasValidDisplayName = displayName.trim().length > 0;
  const passwordFieldsTouched = newPassword.length > 0 || confirmPassword.length > 0;
  const hasAllPasswordFields = newPassword.length > 0 && confirmPassword.length > 0;
  const hasStrongNewPassword = newPassword.length >= 8 && newPassword.length <= 128 && /[A-Za-z]/.test(newPassword) && /\d/.test(newPassword);
  const passwordsMatch = newPassword === confirmPassword;
  const canSubmitPassword = !passwordFieldsTouched || (hasAllPasswordFields && hasStrongNewPassword && passwordsMatch);
  const canSubmit = hasValidDisplayName && (hasProfileChanges || passwordFieldsTouched) && canSubmitPassword && !profileQuery.isLoading;

  const newPasswordError = passwordFieldsTouched && !newPassword ? 'Enter a new password.' : newPassword && !hasStrongNewPassword ? PASSWORD_RULES : undefined;
  const confirmPasswordError = passwordFieldsTouched && !confirmPassword ? 'Confirm your new password.' : confirmPassword && !passwordsMatch ? 'New passwords do not match.' : undefined;

  const profileMutation = useMutation({
    mutationFn: updateMyProfile,
    onSuccess: async (profile) => {
      setNameOverride(null);
      setAvatarPreviewUri(null);
      setAvatarAsset(null);
      setNewPassword('');
      setConfirmPassword('');
      queryClient.setQueryData(['user-profile', 'me'], profile);
      await updateUser({ name: profile.name, avatarUrl: profile.avatarUrl });
      showNotice('Profile updated', 'Your profile changes have been saved.');
    },
    onError: (error) => {
      showNotice('Could not update profile', error instanceof Error ? error.message : 'Please review your details and try again.');
    },
  });

  const handlePickAvatar = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      showNotice('Image too large', 'Profile image must be 5 MB or smaller.');
      return;
    }
    const uri = asset.uri;
    const mimeType = asset.mimeType ?? (uri.toLowerCase().endsWith('.png') ? 'image/png' : uri.toLowerCase().endsWith('.gif') ? 'image/gif' : uri.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg');
    setAvatarAsset({ uri, name: asset.fileName ?? 'avatar.jpg', mimeType });
    setAvatarPreviewUri(uri);
  }, []);

  const handleSubmit = () => {
    if (!canSubmit || profileMutation.isPending) return;
    profileMutation.mutate({
      ...(displayName.trim() !== profileDisplayName ? { name: displayName.trim() } : {}),
      ...(passwordFieldsTouched ? { newPassword, confirmNewPassword: confirmPassword } : {}),
      ...(avatarAsset ? { avatar: avatarAsset } : {}),
    });
  };

  const email = profileQuery.data?.email?.trim() || session?.user.email?.trim() || '';

  return (
    <KeyboardAvoidingView style={[styles.screen, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8, backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}><ArrowLeft color={colors.textSecondary} size={23} /></Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Profile</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Manage your personal info, avatar, and password.</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Personal information</Text>
          <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>Update your name, avatar, and password.</Text>

          <View style={styles.avatarRow}>
            <View style={styles.avatarWrap}>
              {displayAvatarUrl ? <Image source={{ uri: displayAvatarUrl }} cachePolicy="memory-disk" allowDownscaling contentFit="cover" style={[styles.avatarImage, { backgroundColor: colors.surfaceSecondary }]} /> : (
                <View style={styles.avatar}><Text style={styles.avatarText}>{getInitials(displayName)}</Text></View>
              )}
              <Pressable style={styles.avatarEdit} onPress={handlePickAvatar} hitSlop={12}>
                <Camera color="#fff" size={12} />
              </Pressable>
            </View>
            <View style={styles.avatarFields}>
              <AppTextField
                label="Display name"
                value={displayName}
                onChangeText={setNameOverride}
                placeholder="Your name"
                autoCapitalize="words"
                error={!hasValidDisplayName ? 'Display name is required.' : undefined}
                style={styles.profileField}
              />
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Email</Text>
              <View style={[styles.input, styles.inputDisabled, { backgroundColor: colors.surfaceSecondary, borderColor: colors.inputBorder }]}>
                <Text style={[styles.inputDisabledText, { color: colors.textSecondary }]} numberOfLines={1}>{email || 'Account'}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.sectionDivider, { backgroundColor: colors.separator }]} />
          <Text style={[styles.cardTitle, { color: colors.text }]}>Change password</Text>
          <Text style={[styles.cardDescription, { color: colors.textSecondary }]}>{PASSWORD_RULES}</Text>

          <View style={styles.passwordFields}>
            <AppTextField
              label="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="At least 8 characters"
              secureTextEntry={!showPasswords}
              autoComplete="new-password"
              error={newPasswordError}
              style={styles.profileField}
              trailing={(
                <Pressable onPress={() => setShowPasswords((current) => !current)} hitSlop={8} accessibilityLabel={showPasswords ? 'Hide password' : 'Show password'}>
                  {showPasswords ? <EyeOff color={colors.textSecondary} size={18} /> : <Eye color={colors.textSecondary} size={18} />}
                </Pressable>
              )}
            />
            <AppTextField
              label="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repeat new password"
              secureTextEntry={!showPasswords}
              autoComplete="new-password"
              error={confirmPasswordError}
              style={styles.profileField}
            />
          </View>

          <AppButton
            label="Update profile"
            loadingLabel="Updating..."
            icon={passwordFieldsTouched ? Lock : Save}
            block
            style={styles.submit}
            onPress={handleSubmit}
            disabled={!canSubmit || profileMutation.isPending}
            loading={profileMutation.isPending}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f8fafc', flex: 1 },
  header: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#dbe4f1', borderBottomWidth: 1, flexDirection: 'row', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { color: '#0f172a', fontSize: fontSize.subheading, fontWeight: fontWeight.extrabold },
  headerSubtitle: { color: '#64748b', fontSize: fontSize.small, marginTop: spacing.xs / 2 },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  card: { backgroundColor: '#fff', borderRadius: radius.xl, padding: spacing.lg },
  cardTitle: { color: '#0f172a', fontSize: fontSize.body, fontWeight: fontWeight.extrabold },
  cardDescription: { color: '#64748b', fontSize: fontSize.caption, marginTop: spacing.xs },
  avatarRow: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.lg, marginTop: spacing.lg },
  avatarWrap: { height: 64, position: 'relative', width: 64 },
  avatar: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: radius.pill, height: 64, justifyContent: 'center', width: 64 },
  avatarImage: { backgroundColor: '#e8eef7', borderRadius: radius.pill, height: 64, width: 64 },
  avatarText: { color: '#fff', fontSize: fontSize.title, fontWeight: fontWeight.bold },
  avatarEdit: { alignItems: 'center', backgroundColor: '#2563eb', borderColor: '#fff', borderRadius: radius.pill, borderWidth: 2, bottom: -9, elevation: 6, height: 30, justifyContent: 'center', position: 'absolute', right: -9, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, width: 30, zIndex: 10 },
  avatarFields: { flex: 1, minWidth: 0 },
  fieldLabel: { color: '#64748b', fontSize: fontSize.tiny, fontWeight: fontWeight.bold, letterSpacing: 0.5, marginBottom: spacing.sm, marginTop: spacing.md, textTransform: 'uppercase' },
  profileField: { marginTop: spacing.md },
  input: { backgroundColor: '#f8fafc', borderColor: '#cfe1ff', borderRadius: radius.md, borderWidth: 1, color: '#0f172a', fontSize: fontSize.small, minHeight: inputHeight, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  inputDisabled: { backgroundColor: '#f1f5f9' },
  inputDisabledText: { color: '#64748b', fontSize: fontSize.small },
  sectionDivider: { backgroundColor: '#e2e8f0', height: StyleSheet.hairlineWidth, marginVertical: spacing.xl },
  passwordFields: { marginTop: spacing.xs },
  submit: { marginTop: spacing.xl },
});
