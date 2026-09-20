import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { KeyRound, Mail, MailCheck } from 'lucide-react-native';
import { apiFetch } from '../api/client';
import { useTheme } from '../theme/ThemeContext';
import { fontWeight, spacing } from '../theme/tokens';
import { AppButton, AppText, AppTextField } from '../ui';
import { AuthChrome, AuthWordmark } from '../components/AuthChrome';
import { createAuthStyles } from './authStyles';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordScreen({
  onLogin,
  onSignUp,
}: {
  onLogin: () => void;
  onSignUp: () => void;
}) {
  const { colors, isDark } = useTheme();
  const styles = createAuthStyles(colors);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();
  const isValid = useMemo(() => EMAIL_PATTERN.test(normalizedEmail), [normalizedEmail]);

  async function submit() {
    if (!isValid || busy) return;
    setBusy(true);
    setError('');
    try {
      await apiFetch('/auth/forgot-password', {
        method: 'POST',
        auth: false,
        body: JSON.stringify({ email: normalizedEmail }),
      });
      setSentTo(normalizedEmail);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send reset email. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AuthChrome />
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
              <AppText variant="display" style={{ marginTop: spacing.lg }}>Check your email</AppText>
              <AppText variant="body" tone="secondary" style={styles.subtitle}>
                If an account matches{' '}
                <AppText variant="body" tone="primary" style={{ fontWeight: fontWeight.semibold }}>{sentTo}</AppText>,
                we sent a password reset link there.
                Open that email to continue setting a new password.
              </AppText>
            </>
          ) : (
            <>
              <KeyRound size={28} color={colors.primary} />
              <AppText variant="display" style={{ marginTop: spacing.lg }}>Forgot your password?</AppText>
              <AppText variant="body" tone="secondary" style={styles.subtitle}>
                Enter your email and we will send you a reset link if the account exists.
              </AppText>
            </>
          )}
        </View>

        {sentTo ? (
          <View style={styles.form}>
            <AppButton block label="Back to login" onPress={onLogin} />
          </View>
        ) : (
          <>
            <View style={styles.form}>
              <AppTextField
                icon={Mail}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="Email Address"
                value={email}
                onChangeText={setEmail}
                error={error || undefined}
              />

              <AppButton block label="Send reset link" onPress={submit} loading={busy} disabled={busy || !isValid} />
            </View>

            <View style={styles.footerRow}>
              <Pressable onPress={onLogin}>
                <AppText variant="body" tone="secondary">
                  Remember your password?{' '}
                  <AppText variant="body" tone="primary" style={{ fontWeight: fontWeight.semibold }}>
                    Back to login
                  </AppText>
                </AppText>
              </Pressable>
              <Pressable onPress={onSignUp}>
                <AppText variant="body" tone="secondary">
                  Need an account?{' '}
                  <AppText variant="body" tone="primary" style={{ fontWeight: fontWeight.semibold }}>
                    Create account
                  </AppText>
                </AppText>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
