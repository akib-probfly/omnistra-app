import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Svg, Path } from 'react-native-svg';
import {
  User,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useSharedValue,
  withSpring,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useAuth } from '../auth/AuthContext';

function DecorativeWave() {
  return (
    <Svg width="400" height="160" viewBox="0 0 400 160" style={styles.blob}>
      <Path
        d="M0,80 C80,20 200,140 320,60 L400,40 L400,0 L0,0 Z"
        fill="rgba(99,102,241,0.06)"
      />
      <Path
        d="M0,100 C120,60 240,130 400,50 L400,0 L0,0 Z"
        fill="rgba(99,102,241,0.04)"
      />
    </Svg>
  );
}

type FormField = {
  key: string;
  icon: typeof User;
  placeholder: string;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'words' | 'sentences';
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
};

const fields: FormField[] = [
  { key: 'name', icon: User, placeholder: 'John Doe', autoCapitalize: 'words' },
  { key: 'email', icon: Mail, placeholder: 'john@example.com', keyboardType: 'email-address' },
  { key: 'phoneNumber', icon: Phone, placeholder: '+880 1XXX-XXXXXX', keyboardType: 'phone-pad' },
  { key: 'password', icon: Lock, placeholder: 'Min 8 characters', secureTextEntry: true },
  { key: 'confirm_password', icon: Lock, placeholder: 'Repeat password', secureTextEntry: true },
];

export function RegisterScreen({ onLogin }: { onLogin: () => void }) {
  const { register } = useAuth();
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
  const scale = useSharedValue(1);

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const update = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submit() {
    setBusy(true);
    setError('');
    setMessage('');
    scale.value = withSpring(0.96, { damping: 10 }, () => {
      scale.value = withSpring(1);
    });
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
      <LinearGradient
        colors={['#f8faff', '#eef2ff', '#faf5ff']}
        style={StyleSheet.absoluteFillObject}
      />

      <DecorativeWave />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInUp.delay(100).duration(800)} style={styles.header}>
          <View style={styles.logoContainer}>
            <LinearGradient
              colors={['#6366f1', '#8b5cf6']}
              style={styles.logoGradient}
            >
              <Text style={styles.logoIcon}>O</Text>
            </LinearGradient>
          </View>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.subtitle}>Start managing conversations with your team.</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(800)} style={styles.card}>
          {fields.map((field, index) => {
            const Icon = field.icon;
            const isSecure = isSecureField(field.key);
            const currentShow = field.key === 'password' ? showPassword : showConfirm;
            return (
              <Animated.View
                key={field.key}
                entering={FadeInDown.delay(400 + index * 80).duration(600)}
                style={styles.inputWrapper}
              >
                <Icon size={18} color="#6366f1" style={styles.inputIcon} />
                <TextInput
                  autoCapitalize={field.autoCapitalize || 'none'}
                  keyboardType={field.keyboardType || 'default'}
                  placeholder={field.placeholder}
                  placeholderTextColor="#9ca3af"
                  secureTextEntry={isSecure && !currentShow}
                  style={[styles.input, isSecure && styles.inputWithToggle]}
                  value={form[field.key as keyof typeof form]}
                  onChangeText={(value) => update(field.key, value)}
                />
                {isSecure && (
                  <Pressable
                    onPress={() =>
                      field.key === 'password'
                        ? setShowPassword(!showPassword)
                        : setShowConfirm(!showConfirm)
                    }
                    style={styles.eyeToggle}
                  >
                    {currentShow ? (
                      <EyeOff size={18} color="#9ca3af" />
                    ) : (
                      <Eye size={18} color="#9ca3af" />
                    )}
                  </Pressable>
                )}
              </Animated.View>
            );
          })}

          {error ? (
            <Animated.Text entering={FadeInUp.duration(300)} style={styles.error}>
              {error}
            </Animated.Text>
          ) : null}

          {message ? (
            <Animated.View entering={FadeInUp.duration(300)} style={styles.successBox}>
              <CheckCircle2 size={16} color="#10b981" />
              <Text style={styles.successText}>{message}</Text>
            </Animated.View>
          ) : null}

          <Animated.View style={buttonAnimatedStyle}>
            <Pressable
              disabled={busy}
              onPress={submit}
              style={({ pressed }) => [
                styles.primary,
                pressed && styles.primaryPressed,
              ]}
            >
              <LinearGradient
                colors={['#6366f1', '#8b5cf6']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryGradient}
              >
                <Text style={styles.primaryText}>Create account</Text>
                <ArrowRight size={18} color="#fff" style={styles.arrowIcon} />
              </LinearGradient>
            </Pressable>
          </Animated.View>

          <Pressable onPress={onLogin} style={styles.linkWrapper}>
            <Text style={styles.link}>
              Already have an account? <Text style={styles.linkBold}>Sign in</Text>
            </Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  blob: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoContainer: {
    marginBottom: 14,
  },
  logoGradient: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  logoIcon: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
  },
  title: {
    color: '#1e1b4b',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 14,
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: '#111827',
    height: 52,
    fontSize: 15,
  },
  inputWithToggle: {
    paddingRight: 8,
  },
  eyeToggle: {
    padding: 4,
  },
  error: {
    color: '#ef4444',
    fontSize: 13,
    marginBottom: 8,
    marginLeft: 4,
  },
  successBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ecfdf5',
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#d1fae5',
  },
  successText: {
    color: '#065f46',
    fontSize: 13,
    marginLeft: 8,
    flex: 1,
  },
  primary: {
    marginTop: 12,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryPressed: {
    opacity: 0.9,
  },
  primaryGradient: {
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primaryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.2,
  },
  arrowIcon: {
    marginLeft: 8,
  },
  linkWrapper: {
    marginTop: 20,
    alignItems: 'center',
  },
  link: {
    color: '#6b7280',
    fontSize: 14,
  },
  linkBold: {
    color: '#6366f1',
    fontWeight: '700',
  },
});
