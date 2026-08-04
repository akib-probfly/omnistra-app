// @ts-nocheck
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Camera, Check, Eye, EyeOff, LoaderCircle, Lock, Save, User } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { apiUrl } from '../api/client';
import { fetchMyProfile, updateMyProfile } from '../api/profile';
import { useAuth } from '../auth/AuthContext';

function getInitials(value?: string | null) {
  const parts = (value ?? '?').split(' ').filter(Boolean).map((part) => part[0]).slice(0, 2);
  return (parts.join('') || '?').toUpperCase();
}

const PASSWORD_RULES = 'Use 8–128 characters with at least one letter and one number.';

export function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
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
      Alert.alert('Profile updated', 'Your profile changes have been saved.');
    },
    onError: (error) => {
      Alert.alert('Could not update profile', error instanceof Error ? error.message : 'Please review your details and try again.');
    },
  });

  const handlePickAvatar = useCallback(async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Allow access to your photo library to change your profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85, allowsEditing: true, aspect: [1, 1] });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
      Alert.alert('Image too large', 'Profile image must be 5 MB or smaller.');
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
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}><ArrowLeft color="#334155" size={23} /></Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.headerTitle}>Profile</Text>
          <Text style={styles.headerSubtitle}>Manage your personal info, avatar, and password.</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Personal information</Text>
          <Text style={styles.cardDescription}>Update your name, avatar, and password.</Text>

          <View style={styles.avatarRow}>
            <View style={styles.avatarWrap}>
              {displayAvatarUrl ? <Image source={{ uri: displayAvatarUrl }} style={styles.avatarImage} /> : (
                <View style={styles.avatar}><Text style={styles.avatarText}>{getInitials(displayName)}</Text></View>
              )}
              <Pressable style={styles.avatarEdit} onPress={handlePickAvatar} hitSlop={12}>
                <Camera color="#fff" size={15} />
              </Pressable>
            </View>
            <View style={styles.avatarFields}>
              <Text style={styles.fieldLabel}>Display name</Text>
              <TextInput
                value={displayName}
                onChangeText={setNameOverride}
                style={[styles.input, !hasValidDisplayName && styles.inputInvalid]}
                placeholder="Your name"
                placeholderTextColor="#94a3b8"
                autoCapitalize="words"
              />
              <Text style={styles.fieldLabel}>Email</Text>
              <View style={[styles.input, styles.inputDisabled]}>
                <Text style={styles.inputDisabledText} numberOfLines={1}>{email || 'Account'}</Text>
              </View>
            </View>
          </View>

          <View style={styles.sectionDivider} />
          <Text style={styles.cardTitle}>Change password</Text>
          <Text style={styles.cardDescription}>{PASSWORD_RULES}</Text>

          <View style={styles.passwordFields}>
            <Text style={styles.fieldLabel}>New password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                value={newPassword}
                onChangeText={setNewPassword}
                style={[styles.input, styles.passwordInput, newPasswordError && styles.inputInvalid]}
                placeholder="At least 8 characters"
                placeholderTextColor="#94a3b8"
                secureTextEntry={!showPasswords}
                autoComplete="new-password"
              />
              <Pressable style={styles.eye} onPress={() => setShowPasswords((current) => !current)} hitSlop={8}>
                {showPasswords ? <EyeOff color="#64748b" size={18} /> : <Eye color="#64748b" size={18} />}
              </Pressable>
            </View>
            {newPasswordError ? <Text style={styles.fieldError}>{newPasswordError}</Text> : null}

            <Text style={styles.fieldLabel}>Confirm new password</Text>
            <View style={styles.passwordWrap}>
              <TextInput
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                style={[styles.input, styles.passwordInput, confirmPasswordError && styles.inputInvalid]}
                placeholder="Repeat new password"
                placeholderTextColor="#94a3b8"
                secureTextEntry={!showPasswords}
                autoComplete="new-password"
              />
            </View>
            {confirmPasswordError ? <Text style={styles.fieldError}>{confirmPasswordError}</Text> : null}
          </View>

          <Pressable
            style={[styles.submit, !canSubmit || profileMutation.isPending ? styles.submitDisabled : null]}
            onPress={handleSubmit}
            disabled={!canSubmit || profileMutation.isPending}
          >
            {profileMutation.isPending ? (
              <>
                <ActivityIndicator color="#fff" size="small" />
                <Text style={styles.submitText}>Updating...</Text>
              </>
            ) : (
              <>
                {passwordFieldsTouched ? <Lock color="#fff" size={16} /> : <Save color="#fff" size={16} />}
                <Text style={styles.submitText}>Update profile</Text>
              </>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f8fafc', flex: 1 },
  header: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#dbe4f1', borderBottomWidth: 1, flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { color: '#0f172a', fontSize: 17, fontWeight: '800' },
  headerSubtitle: { color: '#64748b', fontSize: 12, marginTop: 2 },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 18 },
  cardTitle: { color: '#0f172a', fontSize: 16, fontWeight: '800' },
  cardDescription: { color: '#64748b', fontSize: 13, marginTop: 3 },
  avatarRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 16, marginTop: 16 },
  avatarWrap: { height: 64, position: 'relative', width: 64 },
  avatar: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 32, height: 64, justifyContent: 'center', width: 64 },
  avatarImage: { backgroundColor: '#e8eef7', borderRadius: 32, height: 64, width: 64 },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  avatarEdit: { alignItems: 'center', backgroundColor: '#2563eb', borderColor: '#fff', borderRadius: 15, borderWidth: 2, bottom: -9, elevation: 6, height: 30, justifyContent: 'center', position: 'absolute', right: -9, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, width: 30, zIndex: 10 },
  avatarFields: { flex: 1, minWidth: 0 },
  fieldLabel: { color: '#64748b', fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 6, marginTop: 12, textTransform: 'uppercase' },
  input: { backgroundColor: '#f8fafc', borderColor: '#cfe1ff', borderRadius: 12, borderWidth: 1, color: '#0f172a', fontSize: 14, paddingHorizontal: 12, paddingVertical: 10 },
  inputInvalid: { borderColor: '#dc2626' },
  inputDisabled: { backgroundColor: '#f1f5f9' },
  inputDisabledText: { color: '#64748b', fontSize: 14 },
  sectionDivider: { backgroundColor: '#e2e8f0', height: StyleSheet.hairlineWidth, marginVertical: 20 },
  passwordFields: { marginTop: 4 },
  passwordWrap: { position: 'relative' },
  passwordInput: { paddingRight: 44 },
  eye: { alignItems: 'center', bottom: 0, justifyContent: 'center', position: 'absolute', right: 12, top: 0 },
  fieldError: { color: '#dc2626', fontSize: 12, marginTop: 4 },
  submit: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 12, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 24, paddingVertical: 13 },
  submitDisabled: { backgroundColor: '#93b4f0' },
  submitText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
