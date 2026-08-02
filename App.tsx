import { NavigationContainer } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppNavigator } from './src/navigation/AppNavigator';
import { AuthProvider } from './src/auth/AuthContext';

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider>
          <NavigationContainer>
            <StatusBar style="dark" backgroundColor="#ffffff" translucent={false} />
            <AppNavigator />
          </NavigationContainer>
        </SafeAreaProvider></GestureHandlerRootView>
      </AuthProvider>
    </QueryClientProvider>
  );
}
