import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

type BoneProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

export function SkeletonBone({ width = '100%', height = 14, radius = 10, style }: BoneProps) {
  const { colors } = useTheme();
  return <View style={[styles.bone, { backgroundColor: colors.surfaceSecondary, width, height, borderRadius: radius }, style]} />;
}

export function SkeletonPulse({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return <Animated.View style={[styles.pulse, { backgroundColor: 'transparent' }, style, { opacity: pulse }]}>{children}</Animated.View>;
}

export function ListSkeleton({ rows = 6, avatar = true }: { rows?: number; avatar?: boolean }) {
  const { colors } = useTheme();
  return (
    <SkeletonPulse style={styles.list}>
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} style={[styles.listRow, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          {avatar ? <SkeletonBone width={44} height={44} radius={14} /> : null}
          <View style={styles.listCopy}>
            <SkeletonBone width={`${58 + (index % 3) * 8}%` as `${number}%`} height={14} />
            <SkeletonBone width={`${42 + (index % 4) * 10}%` as `${number}%`} height={12} style={styles.gap} />
            <SkeletonBone width={`${30 + (index % 2) * 12}%` as `${number}%`} height={10} style={styles.gap} />
          </View>
        </View>
      ))}
    </SkeletonPulse>
  );
}

export function CardGridSkeleton({ cards = 3 }: { cards?: number }) {
  const { colors } = useTheme();
  return (
    <SkeletonPulse style={styles.cardGrid}>
      {Array.from({ length: cards }).map((_, index) => (
        <View key={index} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
          <SkeletonBone width={40} height={40} radius={12} />
          <SkeletonBone width="70%" height={22} style={styles.gapLg} />
          <SkeletonBone width="50%" height={12} style={styles.gap} />
        </View>
      ))}
    </SkeletonPulse>
  );
}

export function DashboardSkeleton() {
  const { colors } = useTheme();
  return (
    <SkeletonPulse style={styles.dashboard}>
      <View style={[styles.dashControls, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <SkeletonBone height={44} radius={14} />
        <View style={styles.dashChips}>
          <SkeletonBone width="31%" height={40} radius={999} />
          <SkeletonBone width="31%" height={40} radius={999} />
          <SkeletonBone width="31%" height={40} radius={999} />
        </View>
      </View>
      <SkeletonBone width="42%" height={20} radius={8} style={styles.sectionTitle} />
      <View style={styles.dashCarousel}>
        <SkeletonBone width={220} height={168} radius={22} />
        <SkeletonBone width={220} height={168} radius={22} />
      </View>
      <SkeletonBone width="48%" height={20} radius={8} style={styles.sectionTitle} />
      <View style={styles.dashCarousel}>
        <SkeletonBone width={220} height={168} radius={22} />
        <SkeletonBone width={220} height={168} radius={22} />
      </View>
      <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <SkeletonBone width="40%" height={16} />
        <SkeletonBone height={140} radius={14} style={styles.gapLg} />
      </View>
    </SkeletonPulse>
  );
}

export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <SkeletonPulse style={styles.form}>
      {Array.from({ length: fields }).map((_, index) => (
        <View key={index} style={styles.formField}>
          <SkeletonBone width="34%" height={12} />
          <SkeletonBone height={44} radius={12} style={styles.gap} />
        </View>
      ))}
      <SkeletonBone height={48} radius={14} style={styles.gapLg} />
    </SkeletonPulse>
  );
}

export function PanelSkeleton({ rows = 4 }: { rows?: number }) {
  const { colors } = useTheme();
  return (
    <SkeletonPulse style={styles.panelList}>
      {Array.from({ length: rows }).map((_, index) => (
        <View key={index} style={[styles.panelRow, { backgroundColor: colors.background }]}>
          <SkeletonBone width={`${62 + (index % 3) * 8}%` as `${number}%`} height={12} />
          <SkeletonBone width={`${40 + (index % 2) * 12}%` as `${number}%`} height={10} style={styles.gap} />
        </View>
      ))}
    </SkeletonPulse>
  );
}

export function ConversationSkeleton() {
  const rows = [
    { align: 'flex-end' as const, width: '52%', height: 36 },
    { align: 'flex-start' as const, width: '64%', height: 44 },
    { align: 'flex-start' as const, width: '38%', height: 32 },
    { align: 'flex-end' as const, width: '70%', height: 40 },
    { align: 'flex-start' as const, width: '46%', height: 36 },
    { align: 'flex-end' as const, width: '58%', height: 32 },
    { align: 'flex-start' as const, width: '72%', height: 48 },
    { align: 'flex-end' as const, width: '40%', height: 32 },
  ];

  return (
    <SkeletonPulse style={styles.conversation}>
      {rows.map((row, index) => (
        <View key={index} style={[styles.bubbleRow, { justifyContent: row.align }]}>
          <SkeletonBone width={row.width as `${number}%`} height={row.height} radius={18} />
        </View>
      ))}
    </SkeletonPulse>
  );
}

export function ComposerSkeleton() {
  const { colors } = useTheme();
  return (
    <SkeletonPulse style={[styles.composer, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
      <SkeletonBone height={58} radius={12} width="100%" />
      <View style={styles.composerActions}>
        <SkeletonBone width={20} height={20} radius={10} />
        <SkeletonBone width={20} height={20} radius={10} />
        <SkeletonBone width={20} height={20} radius={10} />
        <SkeletonBone width={20} height={20} radius={10} />
        <SkeletonBone width={20} height={20} radius={10} />
        <View style={styles.composerSpacer} />
        <SkeletonBone width={40} height={40} radius={20} />
      </View>
    </SkeletonPulse>
  );
}

export function InlineSkeleton({ width = 120, height = 16 }: { width?: number; height?: number }) {
  return (
    <SkeletonPulse>
      <SkeletonBone width={width} height={height} radius={8} />
    </SkeletonPulse>
  );
}

const styles = StyleSheet.create({
  pulse: { width: '100%' },
  bone: { backgroundColor: '#e5ecf5' },
  gap: { marginTop: 8 },
  gapLg: { marginTop: 12 },

  list: { gap: 12, paddingHorizontal: 16, paddingTop: 16 },
  listRow: {
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  listCopy: { flex: 1, justifyContent: 'center', minWidth: 0 },

  cardGrid: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 16 },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    minWidth: 0,
    padding: 12,
  },

  dashboard: { paddingTop: 8 },
  dashControls: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    marginHorizontal: 16,
    padding: 14,
  },
  dashChips: { flexDirection: 'row', justifyContent: 'space-between' },
  sectionTitle: { marginBottom: 12, marginHorizontal: 16, marginTop: 20 },
  dashCarousel: { flexDirection: 'row', gap: 12, paddingHorizontal: 16 },
  panel: {
    borderRadius: 20,
    borderWidth: 1,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
  },

  form: { gap: 16, paddingHorizontal: 16, paddingTop: 16 },
  formField: {},

  panelList: { gap: 12, paddingVertical: 8 },
  panelRow: {
    borderRadius: 12,
    padding: 12,
  },

  conversation: {
    backgroundColor: 'transparent',
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  bubbleRow: { backgroundColor: 'transparent', flexDirection: 'row', marginBottom: 12 },
  composer: {
    backgroundColor: 'transparent',
    borderRadius: 24,
    borderWidth: 1,
    margin: 12,
    padding: 12,
    width: 'auto',
  },
  composerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  composerSpacer: { flex: 1 },
});
