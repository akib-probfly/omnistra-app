declare module '@liquidspirit/react-native-boring-avatars' {
  import type { ComponentType } from 'react';

  type AvatarProps = {
    name?: string;
    size?: number | string;
    variant?: 'marble' | 'beam' | 'pixel' | 'sunset' | 'ring' | 'bauhaus';
    colors?: string[];
    square?: boolean;
  };

  const Avatar: ComponentType<AvatarProps>;
  export default Avatar;
}
