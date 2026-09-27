import { Image } from 'expo-image';
import { Camera } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, radius } from '../theme/tokens';

type Props = {
  uri?: string | null;
  initials: string;
  onPress: () => void;
  size?: number;
};

export function AvatarPicker({ uri, initials, onPress, size = 64 }: Props) {
  const { colors } = useTheme();
  const actionSize = Math.max(28, Math.round(size * 0.46));

  return (
    <View style={[styles.wrap, { height: size, width: size }]}>
      {uri ? (
        <Image source={{ uri }} cachePolicy="memory-disk" allowDownscaling contentFit="cover" style={[styles.avatar, { backgroundColor: colors.surfaceSecondary, borderRadius: size / 2, height: size, width: size }]} />
      ) : (
        <View style={[styles.avatar, styles.fallback, { backgroundColor: colors.primary, borderRadius: size / 2, height: size, width: size }]}>
          <Text style={[styles.initials, { fontSize: size * 0.31, color: colors.primaryText }]}>{initials}</Text>
        </View>
      )}
      <Pressable
        accessibilityLabel="Change profile image"
        hitSlop={12}
        onPress={onPress}
        style={[styles.action, { backgroundColor: colors.primary, borderRadius: actionSize / 2, height: actionSize, right: -actionSize * 0.3, width: actionSize }]}
      >
        <Camera color={colors.primaryText} size={Math.round(actionSize * 0.4)} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  avatar: { overflow: 'hidden' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontWeight: fontWeight.bold },
  action: { alignItems: 'center', borderColor: '#fff', borderWidth: 2, bottom: -9, elevation: 6, justifyContent: 'center', position: 'absolute', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, zIndex: 10 },
});
