import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ChannelsScreen } from '../screens/ChannelsScreen';
import { ChannelDetailsScreen } from '../screens/ChannelDetailsScreen';

export type ChannelsStackParamList = {
  ChannelsList: undefined;
  ChannelDetails: { channelId: string; channelName: string };
};

const Stack = createNativeStackNavigator<ChannelsStackParamList>();

export function ChannelsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChannelsList" component={ChannelsScreen} />
      <Stack.Screen name="ChannelDetails" component={ChannelDetailsScreen} />
    </Stack.Navigator>
  );
}
