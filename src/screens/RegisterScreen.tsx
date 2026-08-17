import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { User, Mail, Phone, Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react-native';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import { AuthChrome, AuthWordmark } from '../components/AuthChrome';
import { createAuthStyles } from './authStyles';

type FormField = {
  key: string;
  icon: typeof User;
  placeholder: string;
  autoCapitalize?: 'none' | 'words' | 'sentences';
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
};

const fields: FormField[] = [
  { key: 'name', icon: User, placeholder: 'Full name', autoCapitalize: 'words' },
  { key: 'email', icon: Mail, placeholder: 'Email', keyboardType: 'email-address' },
  { key: 'phoneNumber', icon: Phone, placeholder: 'Phone', keyboardType: 'phone-pad' },
  { key: 'password', icon: Lock, placeholder: 'Password' },
  { key: 'confirm_password', icon: Lock, placeholder: 'Confirm password' },
];

export function RegisterScreen({ onLogin }: { onLogin: () => void }) {
  const { register } = useAuth();
  const { colors, isDark } = useTheme();
  const styles = createAuthStyles(colors);
  const [form, setForm] = useState({
    name: '',
    email: '',
    phoneNumber: '',
    password: '',
    confirm_password: '',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const update = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await register({
        ...form,
        phoneCountryCode: 'BD',
        phoneDialCode: '+880',
      });
      setMessage('Account created. Check your email to verify it.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create account.');
    } finally {
      setBusy(false);
    }
  }

  const isSecureField = (key: string) => key === 'password' || key === 'confirm_password';

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
          <Text style={styles.title}>Create account</Text>
          <Text style={styles.subtitle}>A few details to get your workspace started.</Text>
        </View>

        <View style={styles.form}>
          {fields.map((field) => {
            const Icon = field.icon;
            const isSecure = isSecureField(field.key);
            const currentShow = field.key === 'password' ? showPassword : showConfirm;
            return (
              <View key={field.key} style={styles.inputWrapper}>
                <Icon size={16} color={colors.textMuted} style={styles.inputIcon} />
                <TextInput
                  autoCapitalize={field.autoCapitalize || 'none'}
                  keyboardType={field.keyboardType || 'default'}
                  placeholder={field.placeholder}
                  placeholderTextColor={colors.textMuted}
                  secureTextEntry={isSecure && !currentShow}
                  style={[styles.input, isSecure && styles.inputWithToggle]}
                  value={form[field.key as keyof typeof form]}
                  onChangeText={(value) => update(field.key, value)}
                />
                {isSecure ? (
                  <Pressable
                    onPress={() =>
                      field.key === 'password'
                        ? setShowPassword(!showPassword)
                        : setShowConfirm(!showConfirm)
                    }
                    style={styles.eyeToggle}
                  >
                    {currentShow ? <EyeOff size={16} color={colors.textMuted} /> : <Eye size={16} color={colors.textMuted} />}
                  </Pressable>
                ) : null}
              </View>
            );
          })}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          {message ? (
            <View style={styles.successBox}>
              <CheckCircle2 size={16} color="#166534" />
              <Text style={styles.successText}>{message}</Text>
            </View>
          ) : null}

          <Pressable
            disabled={busy}
            onPress={submit}
            style={({ pressed }) => [styles.primary, pressed && styles.primaryPressed]}
          >
            <Text style={styles.primaryText}>{busy ? 'Creating…' : 'Create account'}</Text>
          </Pressable>
        </View>

        <Pressable onPress={onLogin} style={styles.linkWrapper}>
          <Text style={styles.link}>
            Already have an account? <Text style={styles.linkBold}>Sign in</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
