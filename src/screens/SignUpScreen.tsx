import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Check, ChevronDown, Eye, EyeOff, Lock, Mail, MailCheck, Search, UserRound } from 'lucide-react-native';
import { apiFetch } from '../api/client';
import { BottomSheet, SheetFlatList } from '../components/BottomSheet';
import { AuthChrome, AuthWordmark } from '../components/AuthChrome';
import { getCountryFlag, listCountryCallingCodes } from '../lib/countryFromPhone';
import { useTheme } from '../theme/ThemeContext';
import { fontWeight, spacing } from '../theme/tokens';
import { AppButton, AppText, AppTextField } from '../ui';
import { createAuthStyles } from './authStyles';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DEFAULT_COUNTRY_CODE = 'BD';
const DEFAULT_DIAL_CODE = '+880';
const COUNTRY_OPTIONS = listCountryCallingCodes();
const DEFAULT_COUNTRY = COUNTRY_OPTIONS.find((country) => country.isoCode === DEFAULT_COUNTRY_CODE)
  ?? { isoCode: DEFAULT_COUNTRY_CODE, dialCode: DEFAULT_DIAL_CODE.replace(/\D/g, ''), name: 'Bangladesh' };

type RegisterResponse = {
  state: 'pending_verification';
  nextAction: 'verify_email';
  email: string;
};

function getClientTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function SignUpScreen({
  onLogin,
}: {
  onLogin: () => void;
}) {
  const { colors, isDark } = useTheme();
  const styles = createAuthStyles(colors);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [selectedCountry, setSelectedCountry] = useState(DEFAULT_COUNTRY);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [countryPickerOpen, setCountryPickerOpen] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const normalizedCountryCode = selectedCountry.isoCode.trim().toUpperCase();
  const normalizedDialCode = `+${selectedCountry.dialCode.replace(/\D/g, '')}`;
  const normalizedPhone = phoneNumber.replace(/\D/g, '');
  const filteredCountries = useMemo(() => {
    const query = countrySearch.trim().toLowerCase();
    const dialQuery = query.replace(/\D/g, '');
    if (!query) return COUNTRY_OPTIONS;
    return COUNTRY_OPTIONS.filter((country) =>
      country.name.toLowerCase().includes(query)
      || country.isoCode.toLowerCase().includes(query)
      || (dialQuery ? country.dialCode.includes(dialQuery) : false),
    );
  }, [countrySearch]);
  const isValid = useMemo(() => {
    if (!name.trim()) return false;
    if (!EMAIL_PATTERN.test(normalizedEmail)) return false;
    if (!/^[A-Z]{2}$/.test(normalizedCountryCode)) return false;
    if (!/^\+[1-9]\d{0,3}$/.test(normalizedDialCode)) return false;
    if (!/^\d{4,20}$/.test(normalizedPhone)) return false;
    if (normalizedCountryCode === 'BD' && !/^1\d{9}$/.test(normalizedPhone)) return false;
    if (password.length < 8 || password.length > 128) return false;
    return password === confirmPassword;
  }, [confirmPassword, name, normalizedCountryCode, normalizedDialCode, normalizedEmail, normalizedPhone, password]);

  async function submit() {
    if (busy) return;
    setError('');
    if (!isValid) {
      setError('Please complete all fields with valid details.');
      return;
    }
    setBusy(true);
    try {
      const response = await apiFetch<RegisterResponse>('/auth/register', {
        method: 'POST',
        auth: false,
        headers: { 'X-Timezone': getClientTimezone() },
        body: JSON.stringify({
          name: name.trim(),
          email: normalizedEmail,
          phoneCountryCode: normalizedCountryCode,
          phoneDialCode: normalizedDialCode,
          phoneNumber: normalizedPhone,
          password,
          confirm_password: confirmPassword,
        }),
      });
      setSentTo(response.email);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create your account. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AuthChrome />
      <BottomSheet
        visible={countryPickerOpen}
        onClose={() => {
          setCountryPickerOpen(false);
          setCountrySearch('');
        }}
        sheetStyle={[{ height: '78%' }, styles.countrySheet]}
      >
        <AppText variant="heading" style={{ marginBottom: spacing.md + 2 }}>Select country</AppText>
        <AppTextField
          icon={Search}
          autoCapitalize="none"
          placeholder="Search country or dial code"
          value={countrySearch}
          onChangeText={setCountrySearch}
        />
        <SheetFlatList
          data={filteredCountries}
          keyExtractor={(item) => `${item.isoCode}-${item.dialCode}`}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const selected = item.isoCode === selectedCountry.isoCode && item.dialCode === selectedCountry.dialCode;
            return (
              <Pressable
                onPress={() => {
                  setSelectedCountry(item);
                  setCountryPickerOpen(false);
                  setCountrySearch('');
                }}
                style={[styles.countryRow, selected && { backgroundColor: colors.surfaceSecondary }]}
              >
                <AppText style={styles.flagText}>{getCountryFlag(item.isoCode)}</AppText>
                <AppText variant="section" numberOfLines={1} style={{ flex: 1 }}>{item.name}</AppText>
                <AppText variant="caption" tone="secondary" style={{ fontWeight: fontWeight.semibold }}>+{item.dialCode}</AppText>
                {selected ? <Check color={colors.primary} size={18} /> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={<AppText variant="small" tone="secondary">No countries match your search.</AppText>}
        />
      </BottomSheet>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <AuthWordmark />
          {sentTo ? (
            <>
              <MailCheck size={28} color={colors.primary} />
              <AppText variant="display" style={{ marginTop: spacing.lg }}>Verify your email</AppText>
              <AppText variant="body" tone="secondary" style={styles.subtitle}>
                We created your account and sent a verification link to{' '}
                <AppText variant="body" tone="primary" style={{ fontWeight: fontWeight.semibold }}>{sentTo}</AppText>.
                Verify that email before signing in.
              </AppText>
            </>
          ) : (
            <>
              <AppText variant="display">Create account</AppText>
              <AppText variant="body" tone="secondary" style={styles.subtitle}>
                Start your Zurvis workspace with your business contact details.
              </AppText>
            </>
          )}
        </View>

        {sentTo ? (
          <View style={styles.form}>
            <AppButton block label="Go to login" onPress={onLogin} />
          </View>
        ) : (
          <>
            <View style={styles.form}>
              <AppTextField
                icon={UserRound}
                autoCapitalize="words"
                autoComplete="name"
                placeholder="Full name"
                value={name}
                onChangeText={setName}
              />

              <AppTextField
                icon={Mail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="Email"
                value={email}
                onChangeText={setEmail}
              />
              <View style={styles.phoneInputRow}>
                <Pressable
                  onPress={() => setCountryPickerOpen(true)}
                  style={styles.countrySelector}
                  accessibilityRole="button"
                  accessibilityLabel="Select phone country"
                >
                  <AppText style={styles.flagText}>{getCountryFlag(selectedCountry.isoCode)}</AppText>
                  <AppText variant="caption" style={{ fontWeight: fontWeight.bold }}>{selectedCountry.isoCode}</AppText>
                  <AppText variant="caption" tone="secondary" style={{ fontWeight: fontWeight.semibold }}>+{selectedCountry.dialCode}</AppText>
                  <ChevronDown color={colors.textMuted} size={14} />
                </Pressable>
                <TextInput
                  autoComplete="tel"
                  keyboardType="phone-pad"
                  placeholder="Phone number"
                  placeholderTextColor={colors.textMuted}
                  style={styles.phoneNumberInput}
                  value={phoneNumber}
                  onChangeText={setPhoneNumber}
                />
              </View>
              <AppTextField
                icon={Lock}
                placeholder="Password"
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                trailing={
                  <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff size={16} color={colors.textMuted} /> : <Eye size={16} color={colors.textMuted} />}
                  </Pressable>
                }
              />

              <AppTextField
                icon={Lock}
                placeholder="Confirm password"
                secureTextEntry={!showConfirmPassword}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                error={error || undefined}
                trailing={
                  <Pressable onPress={() => setShowConfirmPassword(!showConfirmPassword)} hitSlop={8} accessibilityLabel={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}>
                    {showConfirmPassword ? <EyeOff size={16} color={colors.textMuted} /> : <Eye size={16} color={colors.textMuted} />}
                  </Pressable>
                }
              />

              <AppButton block label="Create account" onPress={submit} loading={busy} disabled={busy || !isValid} />
            </View>

            <Pressable onPress={onLogin} style={styles.linkWrapper}>
              <AppText variant="body" tone="secondary">
                Already have an account?{' '}
                <AppText variant="body" tone="primary" style={{ fontWeight: fontWeight.semibold }}>
                  Sign in
                </AppText>
              </AppText>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
