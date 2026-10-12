import { useState } from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainTabs } from './MainTabs';
import { LoginScreen } from '../screens/LoginScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { BillingLockedOverlay } from '../components/BillingLockedOverlay';
import { useAuth } from '../auth/AuthContext';
import { SuperAdminScreen } from '../screens/SuperAdminScreen';

export type RootStackParamList = { Main: undefined; SuperAdmin: undefined };
const Stack = createNativeStackNavigator<RootStackParamList>();

type AuthView = 'login' | 'forgot' | 'signup';

function MainWithOverlays() {
  return (
    <View style={{ flex: 1 }}>
      <MainTabs />
      <BillingLockedOverlay />
    </View>
  );
}

function AuthenticatedApp() {
  const { session } = useAuth();
  return (
    <Stack.Navigator initialRouteName={session?.user.role === 'super_admin' ? 'SuperAdmin' : 'Main'} screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainWithOverlays} />
      <Stack.Screen name="SuperAdmin" component={SuperAdminScreen} />
    </Stack.Navigator>
  );
}

export function AppNavigator() {
  const { session } = useAuth();
  const [authView, setAuthView] = useState<AuthView>('login');

  if (!session) {
    if (authView === 'forgot') {
      return <ForgotPasswordScreen onLogin={() => setAuthView('login')} onSignUp={() => setAuthView('signup')} />;
    }
    if (authView === 'signup') {
      return <SignUpScreen onLogin={() => setAuthView('login')} />;
    }
    return (
      <LoginScreen onForgotPassword={() => setAuthView('forgot')} onSignUp={() => setAuthView('signup')} />
    );
  }

  return <AuthenticatedApp />;
}
