import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BarChart3, ContactRound, Inbox, Radio, Settings } from 'lucide-react-native';
import { DashboardScreen } from '../screens/DashboardScreen';
import { ChannelsStack } from './ChannelsStack';
import { ContactsStack } from './ContactsStack';
import { InboxStack } from './InboxStack';
import { SettingsStack } from './SettingsStack';

export type MainTabParamList = {
  Dashboard: undefined;
  Inbox: undefined;
  Channels: undefined;
  Contacts: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#94a3b8',
        headerShown: false,
        tabBarStyle: { height: 58, paddingBottom: 6, paddingTop: 4 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size} /> }} />
      <Tab.Screen name="Channels" component={ChannelsStack} options={{ tabBarIcon: ({ color, size }) => <Radio color={color} size={size} /> }} />
      <Tab.Screen name="Inbox" component={InboxStack} options={{ tabBarIcon: ({ color, size }) => <Inbox color={color} size={size} /> }} />
      <Tab.Screen name="Contacts" component={ContactsStack} options={{ tabBarIcon: ({ color, size }) => <ContactRound color={color} size={size} /> }} />
      <Tab.Screen name="Settings" component={SettingsStack} options={{ tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }} />
    </Tab.Navigator>
  );
}
