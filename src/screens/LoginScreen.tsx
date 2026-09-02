import { useState } from 'react';
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
import { Mail, Lock, Eye, EyeOff } from 'lucide-react-native';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { AuthChrome, AuthWordmark } from '../components/AuthChrome';
import { createAuthStyles } from './authStyles';

export function LoginScreen({
  onForgotPassword,
}: {
  onForgotPassword: () => void;
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
          <Text style={styles.title}>Sign in</Text>
          <Text style={styles.subtitle}>Enter your email and password to continue.</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.inputWrapper}>
            <Mail size={16} color={colors.textMuted} style={styles.inputIcon} />
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              value={email}
              onChangeText={setEmail}
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

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            disabled={busy}
            onPress={submit}
            style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
          >
            {busy ? <ActivityIndicator color={colors.primaryText} /> : <Text style={styles.primaryText}>Continue</Text>}
          </Pressable>
        </View>

        <Pressable onPress={onForgotPassword} style={styles.linkWrapper}>
          <Text style={styles.link}>
            Forgot your password? <Text style={styles.linkBold}>Reset it</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
