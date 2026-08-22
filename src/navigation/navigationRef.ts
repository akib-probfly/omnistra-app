import { createNavigationContainerRef } from '@react-navigation/native';
import type { NavigatorScreenParams } from '@react-navigation/native';
import type { MainTabParamList } from './MainTabs';

export type RootNavigationParamList = {
  Main: NavigatorScreenParams<MainTabParamList>;
};

export const navigationRef = createNavigationContainerRef<RootNavigationParamList>();
