import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { NavigatorScreenParams } from '@react-navigation/native';
import { BarChart3, ContactRound, Inbox, Radio, Settings } from 'lucide-react-native';
import { Pressable, type PressableProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DashboardScreen } from '../screens/DashboardScreen';
import { ChannelsStack } from './ChannelsStack';
import { ContactsStack } from './ContactsStack';
import { InboxStack, type InboxStackParamList } from './InboxStack';
import { SettingsStack } from './SettingsStack';
import { useTheme } from '../theme/ThemeContext';

export type MainTabParamList = {
  Dashboard: undefined;
  Inbox: NavigatorScreenParams<InboxStackParamList> | undefined;
  Channels: undefined;
  Contacts: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

function TabBarButton({
  children,
  style,
  onPress,
  onLongPress,
  ...rest
}: PressableProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      {...rest}
      onPress={onPress}
      onLongPress={onLongPress}
      android_ripple={{ color: `${colors.primary}24`, foreground: true }}
      style={(state) => [
        typeof style === 'function' ? style(state) : style,
        {
          borderRadius: 12,
          overflow: 'hidden',
        },
        state.pressed && { backgroundColor: `${colors.primary}18` },
      ]}
    >
      {children}
    </Pressable>
  );
}

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
        tabBarButton: (props) => <TabBarButton {...props} />,
        tabBarItemStyle: {
          marginHorizontal: 4,
          marginVertical: 2,
          borderRadius: 12,
        },
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
