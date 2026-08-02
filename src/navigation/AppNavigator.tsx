import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainTabs } from './MainTabs';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { useAuth } from '../auth/AuthContext';
import { useState } from 'react';
import { SplashScreen } from '../screens/SplashScreen';

export type RootStackParamList = { Main: undefined };
const Stack = createNativeStackNavigator<RootStackParamList>();

export function AppNavigator() {
  const { session, loading } = useAuth();
  const [registering, setRegistering] = useState(false);
  if (loading) { console.log('[navigator] showing splash'); return <SplashScreen />; }
  if (!session) { console.log('[navigator] showing login'); return registering ? <RegisterScreen onLogin={() => setRegistering(false)} /> : <LoginScreen onRegister={() => setRegistering(true)} />; }
  console.log('[navigator] showing main app');
  return (
    <Stack.Navigator>
      <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
