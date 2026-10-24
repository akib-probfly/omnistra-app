import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ChannelsScreen } from '../screens/ChannelsScreen';
import { ChannelDetailsScreen } from '../screens/ChannelDetailsScreen';
import { ChannelCatalogScreen } from '../screens/ChannelCatalogScreen';
import { ConnectWhatsAppManualScreen } from '../screens/ConnectWhatsAppManualScreen';
import { ConnectMessengerScreen } from '../screens/ConnectMessengerScreen';

export type ChannelsStackParamList = {
  ChannelsList: undefined;
  ChannelCatalog: undefined;
  ConnectWhatsAppManual: undefined;
  ConnectMessenger: { mode: 'business_manager' | 'user_access_token' } | undefined;
  ChannelDetails: { channelId: string; channelName: string };
};

const Stack = createNativeStackNavigator<ChannelsStackParamList>();

export function ChannelsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChannelsList" component={ChannelsScreen} />
      <Stack.Screen name="ChannelCatalog" component={ChannelCatalogScreen} />
      <Stack.Screen name="ConnectWhatsAppManual" component={ConnectWhatsAppManualScreen} />
      <Stack.Screen name="ConnectMessenger" component={ConnectMessengerScreen} />
      <Stack.Screen name="ChannelDetails" component={ChannelDetailsScreen} />
    </Stack.Navigator>
  );
}
