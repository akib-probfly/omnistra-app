import { AlertTriangle, X, type LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

type ConfirmDialogProps = {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  icon?: LucideIcon;
  onClose: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  icon: Icon = AlertTriangle,
  onClose,
  onConfirm,
}: ConfirmDialogProps) {
  const { colors } = useTheme();

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => !loading && onClose()}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Pressable style={styles.close} onPress={() => !loading && onClose()} hitSlop={8}>
            <X color={colors.textMuted} size={20} />
          </Pressable>
          <View style={[styles.iconWrap, { backgroundColor: destructive ? '#fff1f2' : colors.surfaceSecondary }]}>
            <Icon color={destructive ? '#e11d48' : colors.textSecondary} size={28} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.body, { color: colors.textSecondary }]}>{body}</Text>
          <View style={styles.actions}>
            <Pressable
              style={[styles.cancel, { backgroundColor: colors.surfaceSecondary, borderColor: colors.cardBorder }]}
              disabled={loading}
              onPress={onClose}
            >
              <Text style={[styles.cancelText, { color: colors.text }]}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              style={[styles.confirm, { backgroundColor: destructive ? '#e11d48' : colors.primary }, loading && styles.disabled]}
              disabled={loading}
              onPress={onConfirm}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.confirmText}>{confirmLabel}</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(15,23,42,0.45)',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 28,
    maxWidth: 420,
    paddingHorizontal: 22,
    paddingVertical: 24,
    width: '100%',
  },
  close: { position: 'absolute', right: 14, top: 14, zIndex: 2 },
  iconWrap: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    marginTop: 16,
    textAlign: 'center',
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    marginTop: 10,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 18,
  },
  cancel: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    paddingVertical: 12,
  },
  cancelText: { fontSize: 14, fontWeight: '700' },
  confirm: {
    alignItems: 'center',
    borderRadius: 999,
    flex: 1,
    paddingVertical: 12,
  },
  confirmText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.55 },
});
