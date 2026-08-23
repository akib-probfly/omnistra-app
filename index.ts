import { registerRootComponent } from 'expo';
import * as SplashScreen from 'expo-splash-screen';

import App from './App';
import { registerCallPushTask } from './src/tasks/call-push-task';

void SplashScreen.preventAutoHideAsync();

// Must run in module scope: the task has to exist before the OS wakes the JS
// bundle for a call push that arrives while the app is backgrounded or killed.
registerCallPushTask();

registerRootComponent(App);
