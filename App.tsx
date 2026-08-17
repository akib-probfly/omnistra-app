import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { useRealtimeSync } from './src/hooks/useRealtimeSync';
import { CallControllerProvider } from './src/providers/CallControllerProvider';
import { GlobalCallLayer } from './src/components/GlobalCallLayer';
import { toastConfig } from './src/components/AppToast';
import { SplashScreen } from './src/screens/SplashScreen';
import { ThemeProvider, useTheme } from './src/theme/ThemeContext';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Realtime sync (useRealtimeSync) invalidates affected queries explicitly,
      // so we don't need every query to be refetched on every mount/focus.
      staleTime: 30_000,
      gcTime: 5 * 60_000,
    },
  },
});

function parseBillingReturnUrl(url: string) {
  try {
    const normalized = url.replace(/^osaas:\/\//, 'https://osaas.app/');
    const parsed = new URL(normalized);
    const pathname = parsed.pathname.replace(/^\//, '');
    if (pathname !== 'billing/success' && pathname !== 'billing/cancel') return null;

    const isSuccess = pathname.endsWith('success');
    return {
      routes: [
        {
          name: 'Main',
          state: {
            routes: [
              {
                name: 'Settings',
                state: {
                  index: 1,
                  routes: [
                    { name: 'SettingsList' },
                    {
                      name: 'Billing',
                      params: {
                        tab: isSuccess ? 'current' : 'packages',
                        checkout: isSuccess ? 'success' : 'cancel',
                        planKey: parsed.searchParams.get('planKey') ?? undefined,
                        reference:
                          parsed.searchParams.get('reference')
                          ?? parsed.searchParams.get('pp_reference')
                          ?? undefined,
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      ],
    };
  } catch {
    return null;
  }
}

const linking = {
  prefixes: ['osaas://'],
  config: {
    screens: {
      Main: {
        screens: {
          Settings: {
            screens: {
              Billing: 'billing',
              BillingPlanDetails: 'billing/plan/:planKey',
            },
          },
        },
      },
    },
  },
  async getInitialURL() {
    return Linking.getInitialURL();
  },
  subscribe(listener: (url: string) => void) {
    const subscription = Linking.addEventListener('url', ({ url }) => listener(url));
    return () => subscription.remove();
  },
  getStateFromPath(path: string) {
    return parseBillingReturnUrl(`osaas://${path.replace(/^\//, '')}`) ?? undefined;
  },
};

function RealtimeBridge() {
  const { session } = useAuth();
  useRealtimeSync(session?.accessToken ?? null);
  return null;
}

function AuthenticatedOverlays() {
  const { session } = useAuth();
  if (!session) return null;
  return <GlobalCallLayer />;
}

function ThemedStatusBar() {
  const { isDark, colors } = useTheme();
  return (
    <StatusBar
      style={isDark ? 'light' : 'dark'}
      backgroundColor={colors.background}
      translucent={false}
    />
  );
}

const ROOT_BG = '#f4f7fb';

function RootApp() {
  const { loading } = useAuth();
  const [splashDone, setSplashDone] = useState(false);
  const finishSplash = useCallback(() => setSplashDone(true), []);
  const showSplash = !splashDone || loading;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: ROOT_BG }}>
      <SafeAreaProvider>
        {showSplash ? (
          <SplashScreen
            iconSource={require('./assets/icon.png')}
            wordmarkSource={require('./assets/logo-wordmark.png')}
            tagline="OMNICHANNEL INBOX"
            backgroundColor={ROOT_BG}
            onFinish={finishSplash}
          />
        ) : (
          <NavigationContainer
            linking={linking as never}
            theme={{
              ...DefaultTheme,
              colors: { ...DefaultTheme.colors, background: ROOT_BG },
            }}
          >
            <ThemedStatusBar />
            <RealtimeBridge />
            <AppNavigator />
            <AuthenticatedOverlays />
            <Toast config={toastConfig} position="top" topOffset={56} visibilityTime={2600} />
          </NavigationContainer>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CallControllerProvider>
          <ThemeProvider>
            <RootApp />
          </ThemeProvider>
        </CallControllerProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
