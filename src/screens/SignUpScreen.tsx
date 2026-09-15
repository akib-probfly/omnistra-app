import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Check, ChevronDown, Eye, EyeOff, Lock, Mail, MailCheck, UserRound } from 'lucide-react-native';
import { apiFetch } from '../api/client';
import { BottomSheet, SheetFlatList } from '../components/BottomSheet';
import { AuthChrome, AuthWordmark } from '../components/AuthChrome';
import { getCountryFlag, listCountryCallingCodes } from '../lib/countryFromPhone';
import { useTheme } from '../theme/ThemeContext';
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
        <Text style={styles.sheetTitle}>Select country</Text>
        <TextInput
          autoCapitalize="none"
          placeholder="Search country or dial code"
          placeholderTextColor={colors.textMuted}
          style={styles.sheetSearch}
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
                <Text style={styles.countrySelectorText}>{getCountryFlag(item.isoCode)}</Text>
                <Text style={styles.countryRowText} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.countryRowMeta}>+{item.dialCode}</Text>
                {selected ? <Check color={colors.primary} size={18} /> : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={styles.helpText}>No countries match your search.</Text>}
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
              <Text style={[styles.title, { marginTop: 16 }]}>Verify your email</Text>
              <Text style={styles.subtitle}>
                We created your account and sent a verification link to <Text style={styles.linkBold}>{sentTo}</Text>.
                Verify that email before signing in.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.title}>Create account</Text>
              <Text style={styles.subtitle}>Start your Zurvis workspace with your business contact details.</Text>
            </>
          )}
        </View>

        {sentTo ? (
          <View style={styles.form}>
            <Pressable
              onPress={onLogin}
              style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
            >
              <Text style={styles.primaryText}>Go to login</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.form}>
              <View style={styles.inputWrapper}>
                <UserRound size={16} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  autoCapitalize="words"
                  autoComplete="name"
                  placeholder="Full name"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  value={name}
                  onChangeText={setName}
                />
              </View>

              <View style={styles.inputWrapper}>
                <Mail size={16} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder="Email"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                />
              </View>
              <View style={styles.phoneInputRow}>
                <Pressable
                  onPress={() => setCountryPickerOpen(true)}
                  style={styles.countrySelector}
                  accessibilityRole="button"
                  accessibilityLabel="Select phone country"
                >
                  <Text style={styles.countrySelectorText}>{getCountryFlag(selectedCountry.isoCode)}</Text>
                  <Text style={styles.countrySelectorText}>{selectedCountry.isoCode}</Text>
                  <Text style={styles.countrySelectorMeta}>+{selectedCountry.dialCode}</Text>
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
              <View style={styles.inputWrapper}>
                <Lock size={16} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  placeholder="Password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showPassword}
                  style={[styles.input, styles.inputWithToggle]}
                  value={password}
                  onChangeText={setPassword}
                />
                <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeToggle}>
                  {showPassword ? <EyeOff size={16} color={colors.textMuted} /> : <Eye size={16} color={colors.textMuted} />}
                </Pressable>
              </View>

              <View style={styles.inputWrapper}>
                <Lock size={16} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  placeholder="Confirm password"
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={!showConfirmPassword}
                  style={[styles.input, styles.inputWithToggle]}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                />
                <Pressable onPress={() => setShowConfirmPassword(!showConfirmPassword)} style={styles.eyeToggle}>
                  {showConfirmPassword ? <EyeOff size={16} color={colors.textMuted} /> : <Eye size={16} color={colors.textMuted} />}
                </Pressable>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              <Pressable
                disabled={busy || !isValid}
                onPress={submit}
                style={({ pressed }) => [
                  styles.primary,
                  (busy || !isValid) && styles.primaryDisabled,
                  pressed && isValid && !busy && styles.primaryPressed,
                ]}
              >
                {busy
                  ? <ActivityIndicator color={colors.primaryText} />
                  : <Text style={styles.primaryText}>Create account</Text>}
              </Pressable>
            </View>

            <Pressable onPress={onLogin} style={styles.linkWrapper}>
              <Text style={styles.link}>
                Already have an account? <Text style={styles.linkBold}>Sign in</Text>
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
