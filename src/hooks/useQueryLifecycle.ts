import { focusManager, onlineManager } from '@tanstack/react-query';
import { addNetworkStateListener, getNetworkStateAsync, type NetworkState } from 'expo-network';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

/** Bridge native lifecycle events to the shared React Query managers. */
export function useQueryLifecycle() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    let active = true;
    let networkRevision = 0;
    const updateNetwork = (state: NetworkState) => {
      if (!active) return;
      // Unknown reachability is not proof that the device is offline.
      onlineManager.setOnline(state.isConnected !== false && state.isInternetReachable !== false);
    };
    const checkNetwork = () => {
      const revision = ++networkRevision;
      void getNetworkStateAsync().then((state) => {
        if (revision === networkRevision) updateNetwork(state);
      }).catch((error) => {
        if (__DEV__) console.warn('[query] network state unavailable', error);
      });
    };
    const networkSubscription = addNetworkStateListener((state) => {
      networkRevision += 1;
      updateNetwork(state);
    });
    focusManager.setFocused(AppState.currentState === 'active');
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      focusManager.setFocused(state === 'active');
      if (state === 'active') checkNetwork();
    });
    checkNetwork();

    return () => {
      active = false;
      networkSubscription.remove();
      appStateSubscription.remove();
      focusManager.setFocused(undefined);
      onlineManager.setOnline(true);
    };
  }, []);
}
