import Avatar from '@liquidspirit/react-native-boring-avatars';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useColorfulAvatars } from '../hooks/useInboxAppearance';
import { AuthenticatedImage } from './AuthenticatedImage';

/** Same curated palettes as osaas-frontend `UserAvatar`. */
export const AVATAR_PALETTES: string[][] = [
  ['#BFE8E3', '#F1E8DA', '#F4B36A', '#E86F5C', '#6B4A55'],
  ['#FFF7CC', '#FFE58F', '#FFD666', '#FFC53D', '#FAAD14'],
  ['#E6F4FF', '#BAE0FF', '#91CAFF', '#69B1FF', '#4096FF'],
  ['#F9F0FF', '#EFDBFF', '#D3ADF7', '#B37FEB', '#9254DE'],
  ['#FFF2E8', '#FFD8BF', '#FFBB96', '#FF9C6E', '#FF7A45'],
  ['#F6FFED', '#D9F7BE', '#B7EB8F', '#95DE64', '#73D13D'],
];

function hashName(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

export function paletteFor(name: string) {
  return AVATAR_PALETTES[hashName(name) % AVATAR_PALETTES.length];
}

function getInitials(value?: string | null) {
  const parts = (value ?? '?').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]);
  return (parts.join('') || '?').toUpperCase();
}

type Props = {
  name: string;
  size?: number;
  /** Remote avatar URL — when set, shown instead of generated/initials fallback. */
  url?: string | null;
  /** When false, ignores the global toggle and forces plain initials. */
  allowColorful?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ColorfulAvatar({ name, size = 40, url, allowColorful = true, style }: Props) {
  const { enabled } = useColorfulAvatars();
  const useColorful = allowColorful && enabled;
  const initials = getInitials(name);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [url]);

  if (url && !imageFailed) {
    return (
      <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }, style]}>
        <AuthenticatedImage
          url={url}
          resizeMode="cover"
          style={{ width: size, height: size, borderRadius: size / 2 }}
          onError={() => setImageFailed(true)}
        />
      </View>
    );
  }

  if (!useColorful) {
    return (
      <View style={[styles.plain, { width: size, height: size, borderRadius: size / 2 }, style]}>
        <Text style={[styles.plainText, { fontSize: Math.max(10, Math.round(size * 0.36)) }]}>{initials}</Text>
      </View>
    );
  }

  return (
    <View style={[{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }, style]}>
      <Avatar
        name={name || 'User'}
        colors={paletteFor(name || 'User')}
        variant="beam"
        size={size}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  plain: {
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
    justifyContent: 'center',
  },
  plainText: {
    color: '#475569',
    fontWeight: '700',
  },
});
