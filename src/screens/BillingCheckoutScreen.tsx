import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { CommonActions, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { ScreenHeader } from '../ui';
import { isHttpUrl, parseCheckoutReturnUrl } from '../lib/billing-checkout';
import type { SettingsStackParamList } from '../navigation/SettingsStack';

export function BillingCheckoutScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<SettingsStackParamList>>();
  const route = useRoute<RouteProp<SettingsStackParamList, 'BillingCheckout'>>();
  const { checkoutUrl, planKey } = route.params;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const settledRef = useRef(false);

  const finish = useCallback((result: 'success' | 'cancel', reference?: string) => {
    if (settledRef.current) return;
    settledRef.current = true;
    navigation.dispatch(
      CommonActions.reset({
        index: 1,
        routes: [
          { name: 'SettingsList' },
          {
            name: 'Billing',
            params: {
              tab: result === 'success' ? 'current' : 'packages',
              checkout: result,
              planKey,
              reference,
            },
          },
        ],
      }),
    );
  }, [navigation, planKey]);

  const handleClose = () => finish('cancel');

  const handleNavigation = useCallback((url?: string | null) => {
    if (!url) return false;
    const returned = parseCheckoutReturnUrl(url);
    if (returned) {
      finish(returned.result, returned.reference);
      return true;
    }
    if (url.startsWith('osaas://')) {
      finish('cancel');
      return true;
    }
    if (!isHttpUrl(url)) {
      void Linking.openURL(url).catch(() => undefined);
      return true;
    }
    return false;
  }, [finish]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader title="Secure checkout" subtitle="Complete payment without leaving Zurvis" onBack={handleClose} />
      <View style={styles.body}>
        {error ? (
          <View style={styles.messageWrap}>
            <Text style={[styles.message, { color: colors.text }]}>{error}</Text>
          </View>
        ) : (
          <WebView
            source={{ uri: checkoutUrl }}
            startInLoadingState
            javaScriptEnabled
            domStorageEnabled
            sharedCookiesEnabled
            thirdPartyCookiesEnabled
            setSupportMultipleWindows={false}
            onLoadStart={() => setLoading(true)}
            onLoadEnd={() => setLoading(false)}
            onError={() => {
              setLoading(false);
              setError('Could not load the payment page. Close and try again.');
            }}
            onShouldStartLoadWithRequest={(request) => !handleNavigation(request.url)}
            onNavigationStateChange={(navState: WebViewNavigation) => {
              handleNavigation(navState.url);
            }}
            style={styles.webview}
          />
        )}
        {loading && !error ? (
          <View style={[styles.loader, { backgroundColor: colors.background }]}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loaderText, { color: colors.textSecondary }]}>Loading checkout…</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: { flex: 1 },
  webview: { flex: 1 },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loaderText: { fontSize: 13, fontWeight: '600' },
  messageWrap: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 24 },
  message: { fontSize: 15, textAlign: 'center' },
});
