import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { InboxScreen } from '../screens/InboxScreen';
import { ConversationScreen } from '../screens/ConversationScreen';
import { CreateOrderScreen } from '../screens/CreateOrderScreen';
import type { CreateOrderRouteParams } from './CreateOrderRouteParams';
export type InboxStackParamList = { InboxList: undefined; Conversation: { conversationId: string; contactName: string; workspaceId?: string; channelId?: string; channelType?: string }; CreateOrder: CreateOrderRouteParams };
const Stack = createNativeStackNavigator<InboxStackParamList>();
export function InboxStack() { return <Stack.Navigator screenOptions={{ headerShown: false }}><Stack.Screen name="InboxList" component={InboxScreen} /><Stack.Screen name="Conversation" component={ConversationScreen} /><Stack.Screen name="CreateOrder" component={CreateOrderScreen} options={{ presentation: 'transparentModal', animation: 'fade_from_bottom', contentStyle: { backgroundColor: 'transparent' } }} /></Stack.Navigator>; }
