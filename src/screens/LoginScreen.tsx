import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react-native';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { fontWeight } from '../theme/tokens';
import { AppButton, AppText, AppTextField } from '../ui';
import { AuthChrome, AuthWordmark } from '../components/AuthChrome';
import { createAuthStyles } from './authStyles';

export function LoginScreen({
  onForgotPassword,
  onSignUp,
}: {
  onForgotPassword: () => void;
  onSignUp: () => void;
}) {
  const { login } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = createAuthStyles(colors);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await login(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to sign in.');
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
          <AppText variant="display">Sign in</AppText>
          <AppText variant="body" tone="secondary" style={styles.subtitle}>
            Enter your email and password to continue.
          </AppText>
        </View>

        <View style={styles.form}>
          <AppTextField
            icon={Mail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
          />

          <AppTextField
            icon={Lock}
            placeholder="Password"
            secureTextEntry={!showPassword}
            value={password}
            onChangeText={setPassword}
            error={error || undefined}
            trailing={
              <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={8} accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                {showPassword ? <EyeOff size={16} color={colors.textMuted} /> : <Eye size={16} color={colors.textMuted} />}
              </Pressable>
            }
          />

          <AppButton block label="Continue" onPress={submit} loading={busy} disabled={busy} />
        </View>

        <Pressable onPress={onForgotPassword} style={styles.linkWrapper}>
          <AppText variant="body" tone="secondary">
            Forgot your password?{' '}
            <AppText variant="body" tone="primary" style={{ fontWeight: fontWeight.semibold }}>
              Reset it
            </AppText>
          </AppText>
        </Pressable>

        <Pressable onPress={onSignUp} style={styles.linkWrapper}>
          <AppText variant="body" tone="secondary">
            New to Zurvis?{' '}
            <AppText variant="body" tone="primary" style={{ fontWeight: fontWeight.semibold }}>
              Create account
            </AppText>
          </AppText>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
