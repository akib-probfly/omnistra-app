import { Image } from 'expo-image';
import { Plug } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme/ThemeContext';
import { radius } from '../theme/tokens';

function normalizeIntegrationId(value: string) {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (normalized.startsWith('pathao')) return 'pathao';
  if (normalized.startsWith('steadfast')) return 'steadfast';
  if (normalized.startsWith('shopify')) return 'shopify';
  if (normalized.startsWith('woocommerce')) return 'woocommerce';
  return normalized;
}

export function IntegrationLogo({ integrationId, size = 52 }: { integrationId: string; size?: number }) {
  const { colors } = useTheme();
  const id = normalizeIntegrationId(integrationId);

  if (id === 'pathao') {
    return (
      <View style={[styles.logo, { width: size, height: size, backgroundColor: '#ef3340' }]}>
        <Image source={require('../../assets/integration-pathao-mark.png')} style={{ width: size * 1.38, height: size * 1.38 }} contentFit="contain" />
      </View>
    );
  }

  if (id === 'steadfast') {
    return (
      <View style={[styles.logo, { width: size, height: size, backgroundColor: '#edffd9' }]}>
        <Image source={require('../../assets/integration-steadfast.jpg')} style={{ width: size * 0.9, height: size * 0.9 }} contentFit="contain" />
      </View>
    );
  }

  if (id === 'shopify') {
    return (
      <View style={[styles.logo, { width: size, height: size, backgroundColor: '#95bf47' }]}>
        <Svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24">
          <Path fill="#fff" d="M15.337 23.979l7.216-1.561s-2.604-17.613-2.625-17.73c-.018-.116-.114-.192-.211-.192s-1.929-.136-1.929-.136-1.275-1.274-1.439-1.411c-.045-.037-.075-.057-.121-.074l-.914 21.104h.023zM11.71 11.305s-.81-.424-1.774-.424c-1.447 0-1.504.906-1.504 1.141 0 1.232 3.24 1.715 3.24 4.629 0 2.295-1.44 3.76-3.406 3.76-2.354 0-3.54-1.465-3.54-1.465l.646-2.086s1.245 1.066 2.28 1.066c.675 0 .975-.545.975-.932 0-1.619-2.654-1.694-2.654-4.359-.034-2.237 1.571-4.416 4.827-4.416 1.257 0 1.875.361 1.875.361l-.945 2.715-.02.01zM11.17.83c.136 0 .271.038.405.135-.984.465-2.064 1.639-2.508 3.992-.656.213-1.293.405-1.889.578C7.697 3.75 8.951.84 11.17.84V.83zm1.235 2.949v.135c-.754.232-1.583.484-2.394.736.466-1.777 1.333-2.645 2.085-2.971.193.501.309 1.176.309 2.1zm.539-2.234c.694.074 1.141.867 1.429 1.755-.349.114-.735.231-1.158.366v-.252c0-.752-.096-1.371-.271-1.871v.002zm2.992 1.289c-.02 0-.06.021-.078.021s-.289.075-.714.21c-.423-1.233-1.176-2.37-2.508-2.37h-.115C12.135.209 11.669 0 11.265 0 8.159 0 6.675 3.877 6.21 5.846c-1.194.365-2.063.636-2.16.674-.675.213-.694.232-.772.87-.075.462-1.83 14.063-1.83 14.063L15.009 24l.927-21.166z" />
        </Svg>
      </View>
    );
  }

  if (id === 'woocommerce') {
    return (
      <View style={[styles.logo, { width: size, height: size, backgroundColor: '#7f3fff' }]}>
        <Image source={require('../../assets/integration-woocommerce.png')} style={{ width: size * 0.9, height: size * 0.9 }} contentFit="contain" />
      </View>
    );
  }

  return (
    <View style={[styles.logo, { width: size, height: size, backgroundColor: colors.primarySoft }]}>
      <Plug color={colors.primary} size={size * 0.48} />
    </View>
  );
}

const styles = StyleSheet.create({
  logo: { alignItems: 'center', borderRadius: radius.pill, justifyContent: 'center', overflow: 'hidden' },
});
