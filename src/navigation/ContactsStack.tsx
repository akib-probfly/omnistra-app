import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ContactDetailsScreen } from '../screens/ContactDetailsScreen';
import { ContactsScreen } from '../screens/ContactsScreen';

export type ContactsStackParamList = {
  ContactsList: undefined;
  ContactDetails: { contactId: string; contactName: string };
};

const Stack = createNativeStackNavigator<ContactsStackParamList>();

export function ContactsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ContactsList" component={ContactsScreen} />
      <Stack.Screen name="ContactDetails" component={ContactDetailsScreen} />
    </Stack.Navigator>
  );
}
