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
import { KeyRound, Mail, MailCheck } from 'lucide-react-native';
import { apiFetch } from '../api/client';
import { useTheme } from '../theme/ThemeContext';
import { AuthChrome, AuthWordmark } from '../components/AuthChrome';
import { createAuthStyles } from './authStyles';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ForgotPasswordScreen({
  onLogin,
  onRegister,
}: {
  onLogin: () => void;
  onRegister: () => void;
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
      <StatusBar style={isDark ? 'light' : 'dark'} backgroundColor={colors.background} />
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
              <Text style={[styles.title, { marginTop: 16 }]}>Check your email</Text>
              <Text style={styles.subtitle}>
                If an account matches <Text style={styles.linkBold}>{sentTo}</Text>, we sent a password reset link there.
                Open that email to continue setting a new password.
              </Text>
            </>
          ) : (
            <>
              <KeyRound size={28} color={colors.primary} />
              <Text style={[styles.title, { marginTop: 16 }]}>Forgot your password?</Text>
              <Text style={styles.subtitle}>
                Enter your email and we will send you a reset link if the account exists.
              </Text>
            </>
          )}
        </View>

        {sentTo ? (
          <View style={styles.form}>
            <Pressable
              onPress={onLogin}
              style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
            >
              <Text style={styles.primaryText}>Back to login</Text>
            </Pressable>
            <Pressable
              onPress={onRegister}
              style={({ pressed }) => [styles.secondary, pressed && styles.primaryPressed]}
            >
              <Text style={styles.secondaryText}>Create account</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.form}>
              <View style={styles.inputWrapper}>
                <Mail size={16} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  autoCapitalize="none"
                  autoComplete="email"
                  keyboardType="email-address"
                  placeholder="Email Address"
                  placeholderTextColor={colors.textMuted}
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                />
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
                  : <Text style={styles.primaryText}>Send reset link</Text>}
              </Pressable>
            </View>

            <View style={styles.footerRow}>
              <Pressable onPress={onLogin}>
                <Text style={styles.link}>
                  Remember your password? <Text style={styles.linkBold}>Back to login</Text>
                </Text>
              </Pressable>
              <Pressable onPress={onRegister}>
                <Text style={styles.linkBold}>Create account</Text>
              </Pressable>
            </View>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
