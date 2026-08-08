import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Svg, Path } from 'react-native-svg';
import { Mail, Lock, Eye, EyeOff, ArrowRight } from 'lucide-react-native';
import Animated, {
  FadeInDown,
  FadeInUp,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
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

export function LoginScreen({ onRegister }: { onRegister: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const scale = useSharedValue(1);

  const buttonAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  async function submit() {
    setBusy(true);
    setError('');
    scale.value = withSpring(0.96, { damping: 10 }, () => {
      scale.value = withSpring(1);
    });
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
          <Text style={styles.logo}>omnistra</Text>
          <Text style={styles.tagline}>Your omnichannel inbox, everywhere.</Text>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(300).duration(800)} style={styles.card}>
          <Text style={styles.title}>Welcome back</Text>
          <Text style={styles.subtitle}>Sign in to your workspace</Text>

          <View style={styles.inputWrapper}>
            <Mail size={18} color="#6366f1" style={styles.inputIcon} />
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email address"
              placeholderTextColor="#9ca3af"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.inputWrapper}>
            <Lock size={18} color="#6366f1" style={styles.inputIcon} />
            <TextInput
              placeholder="Password"
              placeholderTextColor="#9ca3af"
              secureTextEntry={!showPassword}
              style={[styles.input, styles.inputWithToggle]}
              value={password}
              onChangeText={setPassword}
            />
            <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeToggle}>
              {showPassword ? (
                <EyeOff size={18} color="#9ca3af" />
              ) : (
                <Eye size={18} color="#9ca3af" />
              )}
            </Pressable>
          </View>

          {error ? (
            <Animated.Text entering={FadeInUp.duration(300)} style={styles.error}>
              {error}
            </Animated.Text>
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
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.primaryText}>Sign in</Text>
                    <ArrowRight size={18} color="#fff" style={styles.arrowIcon} />
                  </>
                )}
              </LinearGradient>
            </Pressable>
          </Animated.View>

          <Pressable onPress={onRegister} style={styles.linkWrapper}>
            <Text style={styles.link}>
              Don't have an account? <Text style={styles.linkBold}>Sign up</Text>
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
  logo: {
    color: '#1e1b4b',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  tagline: {
    color: '#6b7280',
    fontSize: 13,
    marginTop: 6,
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
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: '#6b7280',
    fontSize: 14,
    marginTop: 6,
    marginBottom: 28,
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
