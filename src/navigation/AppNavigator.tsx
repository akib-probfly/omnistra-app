import { useState } from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainTabs } from './MainTabs';
import { LoginScreen } from '../screens/LoginScreen';
import { RegisterScreen } from '../screens/RegisterScreen';
import { useAuth } from '../auth/AuthContext';

export type RootStackParamList = { Main: undefined };
const Stack = createNativeStackNavigator<RootStackParamList>();

function AuthenticatedApp() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}

export function AppNavigator() {
  const { session } = useAuth();
  const [registering, setRegistering] = useState(false);

  if (!session) {
    return registering
      ? <RegisterScreen onLogin={() => setRegistering(false)} />
      : <LoginScreen onRegister={() => setRegistering(true)} />;
  }

  return <AuthenticatedApp />;
}
