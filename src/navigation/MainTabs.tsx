import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BarChart3, Inbox, Radio, Settings } from 'lucide-react-native';
import { DashboardScreen } from '../screens/DashboardScreen';
import { InboxStack } from './InboxStack';
import { ChannelsScreen } from '../screens/ChannelsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

export type MainTabParamList = {
  Dashboard: undefined;
  Inbox: undefined;
  Channels: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  return (
    <Tab.Navigator screenOptions={{ tabBarActiveTintColor: '#2563eb', tabBarInactiveTintColor: '#94a3b8', headerShown: false }}>
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ tabBarIcon: ({ color, size }) => <BarChart3 color={color} size={size} /> }} />
      <Tab.Screen name="Inbox" component={InboxStack} options={{ tabBarIcon: ({ color, size }) => <Inbox color={color} size={size} /> }} />
      <Tab.Screen name="Channels" component={ChannelsScreen} options={{ tabBarIcon: ({ color, size }) => <Radio color={color} size={size} /> }} />
      <Tab.Screen name="Settings" component={SettingsScreen} options={{ tabBarIcon: ({ color, size }) => <Settings color={color} size={size} /> }} />
    </Tab.Navigator>
  );
}
