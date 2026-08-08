import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AuthProvider, useAuth } from './src/auth/AuthContext';
import { useRealtimeSync } from './src/hooks/useRealtimeSync';
import { CallControllerProvider } from './src/providers/CallControllerProvider';
import { GlobalCallLayer } from './src/components/GlobalCallLayer';

const queryClient = new QueryClient();

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

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CallControllerProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <SafeAreaProvider>
              <NavigationContainer>
                <StatusBar style="dark" backgroundColor="#ffffff" translucent={false} />
                <RealtimeBridge />
                <AppNavigator />
                <AuthenticatedOverlays />
                <Toast />
              </NavigationContainer>
            </SafeAreaProvider>
          </GestureHandlerRootView>
        </CallControllerProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
