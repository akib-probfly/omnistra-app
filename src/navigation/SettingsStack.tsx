import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SettingsScreen } from '../screens/SettingsScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { WorkspaceSettingsScreen } from '../screens/WorkspaceSettingsScreen';
import { BillingSettingsScreen } from '../screens/BillingSettingsScreen';
import { BillingPlanDetailsScreen } from '../screens/BillingPlanDetailsScreen';
import { NotificationSettingsScreen } from '../screens/NotificationSettingsScreen';
import { QuickRepliesSettingsScreen } from '../screens/QuickRepliesSettingsScreen';
import { AssignmentPolicySettingsScreen } from '../screens/AssignmentPolicySettingsScreen';
import { InboxAppearanceSettingsScreen } from '../screens/InboxAppearanceSettingsScreen';
import { BroadcastSettingsScreen } from '../screens/BroadcastSettingsScreen';
import { BroadcastCampaignScreen } from '../screens/BroadcastCampaignScreen';
import { BroadcastCreateScreen } from '../screens/BroadcastCreateScreen';
import { PrivacyPolicyScreen } from '../screens/PrivacyPolicyScreen';
import type { BillingInterval } from '../api/billing';

export type SettingsStackParamList = {
  SettingsList: undefined;
  Profile: undefined;
  Workspace: undefined;
  Notifications: undefined;
  InboxAppearance: undefined;
  QuickReplies: undefined;
  AssignmentPolicy: undefined;
  Broadcast: undefined;
  BroadcastCampaign: { campaignId: string };
  BroadcastCreate: { campaignId?: string } | undefined;
  Billing: {
    tab?: 'current' | 'packages' | 'invoices' | 'history';
    checkout?: 'success' | 'cancel';
    planKey?: string;
    reference?: string;
  } | undefined;
  BillingPlanDetails: {
    planKey: string;
    workspaceId: string;
    cycle: BillingInterval;
  };
  PrivacyPolicy: undefined;
};

const Stack = createNativeStackNavigator<SettingsStackParamList>();

export function SettingsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="SettingsList" component={SettingsScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
      <Stack.Screen name="Workspace" component={WorkspaceSettingsScreen} />
      <Stack.Screen name="Notifications" component={NotificationSettingsScreen} />
      <Stack.Screen name="InboxAppearance" component={InboxAppearanceSettingsScreen} />
      <Stack.Screen name="QuickReplies" component={QuickRepliesSettingsScreen} />
      <Stack.Screen name="AssignmentPolicy" component={AssignmentPolicySettingsScreen} />
      <Stack.Screen name="Broadcast" component={BroadcastSettingsScreen} />
      <Stack.Screen name="BroadcastCampaign" component={BroadcastCampaignScreen} />
      <Stack.Screen name="BroadcastCreate" component={BroadcastCreateScreen} />
      <Stack.Screen name="Billing" component={BillingSettingsScreen} />
      <Stack.Screen name="BillingPlanDetails" component={BillingPlanDetailsScreen} />
      <Stack.Screen name="PrivacyPolicy" component={PrivacyPolicyScreen} />
    </Stack.Navigator>
  );
}
