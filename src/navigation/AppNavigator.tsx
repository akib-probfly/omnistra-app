import { useState } from 'react';
import { View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MainTabs } from './MainTabs';
import { LoginScreen } from '../screens/LoginScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { BillingLockedOverlay } from '../components/BillingLockedOverlay';
import { useAuth } from '../auth/AuthContext';

export type RootStackParamList = { Main: undefined };
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
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Main" component={MainWithOverlays} />
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
