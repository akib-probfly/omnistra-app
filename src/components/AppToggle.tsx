import { Pressable, StyleSheet, View } from 'react-native';

type Tone = 'blue' | 'amber';
type Variant = 'pill' | 'sidebar';

type Props = {
  value: boolean;
  onValueChange?: (value: boolean) => void;
  disabled?: boolean;
  tone?: Tone;
  variant?: Variant;
  accessibilityLabel?: string;
};

/**
 * Shared pill toggle used across inbox filters and channel settings.
 * - pill: soft track + white thumb (settings / filter rows)
 * - sidebar: amber thumb off / blue thumb on (inbox unreplied control)
 */
export function AppToggle({
  value,
  onValueChange,
  disabled = false,
  tone = 'blue',
  variant = 'pill',
  accessibilityLabel,
}: Props) {
  const content = variant === 'sidebar' ? (
    <View style={[styles.sidebarTrack, value ? styles.sidebarTrackOn : styles.sidebarTrackOff, disabled && styles.disabled]}>
      <View style={[styles.sidebarThumb, value ? styles.sidebarThumbOn : styles.sidebarThumbOff]} />
    </View>
  ) : (
    <View
      style={[
        styles.track,
        value
          ? (tone === 'amber' ? styles.trackAmber : styles.trackBlue)
          : styles.trackOff,
        disabled && styles.disabled,
      ]}
    >
      <View style={[styles.thumb, value ? styles.thumbOn : styles.thumbOff]} />
    </View>
  );

  if (!onValueChange) return content;

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={8}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    borderRadius: 999,
    borderWidth: 1,
    height: 24,
    position: 'relative',
    width: 40,
  },
  trackOff: {
    backgroundColor: '#f1f5f9',
    borderColor: '#e2e8f0',
  },
  trackBlue: {
    backgroundColor: '#2563eb',
    borderColor: '#1d4ed8',
  },
  trackAmber: {
    backgroundColor: '#f59e0b',
    borderColor: '#d97706',
  },
  thumb: {
    backgroundColor: '#fff',
    borderRadius: 999,
    elevation: 1,
    height: 20,
    position: 'absolute',
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 2,
    top: 1,
    width: 20,
  },
  thumbOff: { left: 2 },
  thumbOn: { left: 18 },
  sidebarTrack: {
    borderRadius: 999,
    borderWidth: 1,
    height: 22,
    position: 'relative',
    width: 36,
  },
  sidebarTrackOff: { backgroundColor: '#fff', borderColor: '#e2e8f0' },
  sidebarTrackOn: { backgroundColor: '#2563eb', borderColor: '#1d4ed8' },
  sidebarThumb: {
    borderRadius: 999,
    borderWidth: 1,
    height: 18,
    position: 'absolute',
    top: 1,
    width: 18,
  },
  sidebarThumbOff: { backgroundColor: '#fffbeb', borderColor: '#e2e8f0', left: 2 },
  sidebarThumbOn: { backgroundColor: '#fff', borderColor: '#fff', left: 15 },
  disabled: { opacity: 0.55 },
});
