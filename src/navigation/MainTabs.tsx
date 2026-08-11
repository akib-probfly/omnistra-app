import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BarChart3, ContactRound, Inbox, Radio, Settings } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DashboardScreen } from '../screens/DashboardScreen';
import { ChannelsStack } from './ChannelsStack';
import { ContactsStack } from './ContactsStack';
import { InboxStack } from './InboxStack';
import { SettingsStack } from './SettingsStack';
import { useTheme } from '../theme/ThemeContext';

export type MainTabParamList = {
  Dashboard: undefined;
  Inbox: undefined;
  Channels: undefined;
  Contacts: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

export function MainTabs() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const bottomPad = Math.max(insets.bottom, 8) + 4;

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        headerShown: false,
        tabBarStyle: {
          height: 54 + bottomPad,
          paddingBottom: bottomPad,
          paddingTop: 4,
          backgroundColor: colors.surface,
          borderTopColor: colors.cardBorder,
        },
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
