import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { WorkspaceSettingsScreen } from '../screens/WorkspaceSettingsScreen';
import { BillingSettingsScreen } from '../screens/BillingSettingsScreen';
import { NotificationSettingsScreen } from '../screens/NotificationSettingsScreen';
import { QuickRepliesSettingsScreen } from '../screens/QuickRepliesSettingsScreen';
import { AssignmentPolicySettingsScreen } from '../screens/AssignmentPolicySettingsScreen';

export type SettingsStackParamList = {
  SettingsList: undefined;
  Profile: undefined;
  Workspace: undefined;
  Notifications: undefined;
  QuickReplies: undefined;
  AssignmentPolicy: undefined;
  Billing: { tab?: 'current' | 'packages' | 'invoices' | 'history' } | undefined;
};

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SettingsList" component={SettingsScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Workspace" component={WorkspaceSettingsScreen} />
      <Stack.Screen name="Notifications" component={NotificationSettingsScreen} />
      <Stack.Screen name="QuickReplies" component={QuickRepliesSettingsScreen} />
      <Stack.Screen name="AssignmentPolicy" component={AssignmentPolicySettingsScreen} />
      <Stack.Screen name="Billing" component={BillingSettingsScreen} />
    </Stack.Navigator>
  );
}
