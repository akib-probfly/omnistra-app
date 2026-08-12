import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import {
  Image,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  getInboxPattern,
  type InboxPatternId,
} from '../lib/inbox-patterns';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  pattern: InboxPatternId;
  style?: StyleProp<ViewStyle>;
};

type TileSize = { width: number; height: number };

/**
 * Conversation-thread wallpaper matching osaas-frontend.
 * Manually tiles `bg-*-app.png` at the same CSS background-size widths
 * so the pattern is not stretched/zoomed on Android or iOS.
 */
export function InboxPatternBackground({ pattern, style }: Props) {
  const { colors, isDark } = useTheme();
  const resolved = getInboxPattern(pattern);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const tileSize = useMemo<TileSize | null>(() => {
    if (!resolved.appSource || !resolved.tileWidth) return null;
    const asset = Image.resolveAssetSource(resolved.appSource);
    if (!asset?.width || !asset?.height) {
      return { width: resolved.tileWidth, height: resolved.tileWidth };
    }
    const width = resolved.tileWidth;
    const height = Math.round(asset.height * (width / asset.width));
    return { width, height };
  }, [resolved.appSource, resolved.tileWidth]);

  const tiles = useMemo(() => {
    if (!tileSize || viewport.width <= 0 || viewport.height <= 0) return [];
    const cols = Math.ceil(viewport.width / tileSize.width) + 1;
    const rows = Math.ceil(viewport.height / tileSize.height) + 1;
    const items: Array<{ key: string; left: number; top: number }> = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        items.push({
          key: `${row}-${col}`,
          left: col * tileSize.width,
          top: row * tileSize.height,
        });
      }
    }
    return items;
  }, [tileSize, viewport.height, viewport.width]);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setViewport((current) => (
      current.width === width && current.height === height
        ? current
        : { width, height }
    ));
  };

  if (!resolved.appSource || !tileSize) {
    return (
      <LinearGradient
        pointerEvents="none"
        colors={isDark ? [colors.background, colors.surfaceSecondary] as [string, string, ...string[]] : resolved.previewColors as [string, string, ...string[]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        onLayout={onLayout}
        style={[StyleSheet.absoluteFillObject, style]}
      />
    );
  }

  return (
    <View
      pointerEvents="none"
      onLayout={onLayout}
      style={[StyleSheet.absoluteFillObject, { backgroundColor: isDark ? colors.background : resolved.threadColor, overflow: 'hidden' }, style]}
    >
      <View style={styles.tiles}>
        {tiles.map((tile) => (
          <Image
            key={tile.key}
            source={resolved.appSource}
            style={{
              position: 'absolute',
              left: tile.left,
              top: tile.top,
              width: tileSize.width,
              height: tileSize.height,
            }}
          />
        ))}
      </View>
      {/* Soften the pattern like frontend's white/72 overlay */}
      <View style={[styles.fade, { backgroundColor: isDark ? 'rgba(15, 23, 42, 0.78)' : 'rgba(255, 255, 255, 0.22)' }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.6,
  },
  fade: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
});
