import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, lineHeight, spacing } from '../theme/tokens';
import { AppButton } from '../ui/AppButton';

function RecoveryScreen({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.text }]}>Something went wrong</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>
        We couldn’t display the app. Try opening it again. If this keeps happening, close and reopen the app.
      </Text>
      <AppButton label="Try again" onPress={onRetry} size="lg" />
    </View>
  );
}

// Keep auth, query, and call providers mounted while recovering the screen tree.
// This catches React rendering failures; request errors stay with their screens.
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[app] rendering failed', error, info.componentStack);
  }

  private retry = () => this.setState({ failed: false });

  render() {
    return this.state.failed ? <RecoveryScreen onRetry={this.retry} /> : this.props.children;
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl, gap: spacing.lg },
  title: { fontSize: fontSize.title, fontWeight: fontWeight.bold, textAlign: 'center' },
  message: { fontSize: fontSize.body, lineHeight: lineHeight.body, textAlign: 'center' },
});
