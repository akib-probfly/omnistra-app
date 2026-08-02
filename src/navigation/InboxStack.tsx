import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { InboxScreen } from '../screens/InboxScreen';
import { ConversationScreen } from '../screens/ConversationScreen';
export type InboxStackParamList = { InboxList: undefined; Conversation: { conversationId: string; contactName: string; workspaceId?: string; channelId?: string; channelType?: string } };
const Stack = createNativeStackNavigator<InboxStackParamList>();
export function InboxStack() { return <Stack.Navigator screenOptions={{ headerShown: false }}><Stack.Screen name="InboxList" component={InboxScreen} /><Stack.Screen name="Conversation" component={ConversationScreen} /></Stack.Navigator>; }
