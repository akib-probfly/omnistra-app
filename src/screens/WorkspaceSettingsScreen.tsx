import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, Save } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import {
  fetchMyWorkspaces,
  fetchTimezones,
  formatGmtOffset,
  updateWorkspaceSettings,
  type TimezoneOption,
} from '../api/workspaces';
import { ErrorState } from '../components/ErrorState';
import { FormSkeleton, PanelSkeleton } from '../components/Skeleton';

export function WorkspaceSettingsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const [name, setName] = useState('');
  const [timezone, setTimezone] = useState('');
  const [timezonePickerOpen, setTimezonePickerOpen] = useState(false);
  const [timezoneSearch, setTimezoneSearch] = useState('');

  const workspacesQuery = useQuery({
    queryKey: ['workspaces', 'mine'],
    queryFn: fetchMyWorkspaces,
    staleTime: 30_000,
  });

  const workspace = workspacesQuery.data?.items?.[0] ?? null;

  useEffect(() => {
    if (!workspace) return;
    setName(workspace.name ?? '');
    setTimezone(workspace.timezone ?? '');
  }, [workspace?.id, workspace?.updatedAt]);

  const timezonesQuery = useQuery({
    queryKey: ['timezones'],
    queryFn: () => fetchTimezones(),
    enabled: timezonePickerOpen,
    staleTime: 10 * 60_000,
  });

  const timezoneZones = useMemo(() => {
    const payload = timezonesQuery.data;
    return payload?.zones ?? payload?.items ?? [];
  }, [timezonesQuery.data]);

  const filteredTimezones = useMemo(() => {
    const query = timezoneSearch.trim().toLowerCase();
    if (!query) return timezoneZones.slice(0, 40);
    return timezoneZones
      .filter((zone) => `${zone.zoneName} ${zone.countryName}`.toLowerCase().includes(query))
      .slice(0, 40);
  }, [timezoneZones, timezoneSearch]);

  const dirty = Boolean(workspace) && (
    name.trim() !== (workspace?.name ?? '')
    || timezone.trim() !== (workspace?.timezone ?? '')
  );

  const saveMutation = useMutation({
    mutationFn: () => updateWorkspaceSettings(workspace!.id, {
      name: name.trim(),
      timezone: timezone.trim(),
    }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['workspaces', 'mine'] });
      Alert.alert('Workspace updated', 'Your workspace settings have been saved.');
    },
    onError: (error: Error) => Alert.alert('Could not update workspace', error.message),
  });

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 10, backgroundColor: colors.surface, borderBottomColor: colors.cardBorder }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
          <ArrowLeft color={colors.text} size={22} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Workspace</Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>Name, timezone, and workspace basics</Text>
        </View>
      </View>

      {workspacesQuery.isLoading ? (
        <FormSkeleton fields={4} />
      ) : workspacesQuery.isError || !workspace ? (
        <ErrorState
          message={workspacesQuery.error instanceof Error ? workspacesQuery.error.message : 'Unable to load workspace.'}
          onRetry={() => workspacesQuery.refetch()}
        />
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(insets.bottom, 24) }]}>
          <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
            <View style={[styles.cardIcon, { backgroundColor: colors.surfaceSecondary }]}>
              <Building2 color={colors.primary} size={20} />
            </View>
            <Text style={[styles.cardTitle, { color: colors.text }]}>Workspace details</Text>
            <Text style={[styles.cardBody, { color: colors.textSecondary }]}>Update how this workspace appears across Omnistra.</Text>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Workspace name</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Workspace name" placeholderTextColor={colors.textMuted} style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]} />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Timezone</Text>
            <Pressable style={[styles.inputButton, { backgroundColor: colors.background, borderColor: colors.inputBorder }]} onPress={() => setTimezonePickerOpen(true)}>
              <Text style={[styles.inputButtonText, { color: colors.text }]} numberOfLines={1}>{timezone || 'Select timezone'}</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.saveButton, { backgroundColor: colors.primary }, (!dirty || !name.trim() || saveMutation.isPending) && styles.saveDisabled]}
            disabled={!dirty || !name.trim() || saveMutation.isPending}
            onPress={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? <ActivityIndicator color="#fff" /> : (
              <>
                <Save color="#fff" size={16} />
                <Text style={styles.saveText}>Save changes</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      )}

      <Modal visible={timezonePickerOpen} transparent animationType="slide" onRequestClose={() => setTimezonePickerOpen(false)}>
        <View style={styles.sheetOverlay}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setTimezonePickerOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20), backgroundColor: colors.surface }]}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Select timezone</Text>
            <TextInput
              value={timezoneSearch}
              onChangeText={setTimezoneSearch}
              placeholder="Search timezone..."
              placeholderTextColor={colors.textMuted}
              style={[styles.input, { backgroundColor: colors.background, borderColor: colors.inputBorder, color: colors.text }]}
            />
            {timezonesQuery.isLoading ? (
              <PanelSkeleton rows={5} />
            ) : (
              <FlatList
                data={filteredTimezones}
                keyExtractor={(item) => item.zoneName}
                style={{ marginTop: 10, maxHeight: 360 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }: { item: TimezoneOption }) => (
                  <Pressable
                    style={[styles.timezoneRow, timezone === item.zoneName && { backgroundColor: colors.surfaceSecondary }]}
                    onPress={() => {
                      setTimezone(item.zoneName);
                      setTimezonePickerOpen(false);
                      setTimezoneSearch('');
                    }}
                  >
                    <Text style={[styles.timezoneName, { color: colors.text }]}>{item.zoneName}</Text>
                    <Text style={[styles.timezoneMeta, { color: colors.textSecondary }]}>{formatGmtOffset(item.gmtOffset)} · {item.countryName}</Text>
                  </Pressable>
                )}
                ListEmptyComponent={<Text style={[styles.empty, { color: colors.textMuted }]}>No timezones match your search.</Text>}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f8fafc', flex: 1 },
  header: { alignItems: 'center', backgroundColor: '#fff', borderBottomColor: '#e8eef7', borderBottomWidth: 1, flexDirection: 'row', gap: 10, paddingBottom: 12, paddingHorizontal: 14 },
  backButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  headerCopy: { flex: 1, minWidth: 0 },
  headerTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  headerSubtitle: { color: '#64748b', fontSize: 12, marginTop: 2 },
  loader: { marginTop: 60 },
  content: { gap: 14, padding: 16 },
  card: { backgroundColor: '#fff', borderColor: '#d8e6fb', borderRadius: 18, borderWidth: 1, padding: 16 },
  cardIcon: { alignItems: 'center', backgroundColor: '#eff6ff', borderRadius: 12, height: 40, justifyContent: 'center', marginBottom: 12, width: 40 },
  cardTitle: { color: '#0f172a', fontSize: 16, fontWeight: '800' },
  cardBody: { color: '#64748b', fontSize: 13, marginTop: 4 },
  label: { color: '#64748b', fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderRadius: 12, borderWidth: 1, color: '#0f172a', paddingHorizontal: 12, paddingVertical: 12 },
  inputButton: { backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 14 },
  inputButtonText: { color: '#0f172a', fontSize: 14, fontWeight: '600' },
  saveButton: { alignItems: 'center', backgroundColor: '#2563eb', borderRadius: 14, flexDirection: 'row', gap: 8, justifyContent: 'center', paddingVertical: 14 },
  saveDisabled: { opacity: 0.5 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sheetOverlay: { backgroundColor: 'rgba(15,23,42,0.45)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  sheetTitle: { color: '#0f172a', fontSize: 18, fontWeight: '800', marginBottom: 12 },
  timezoneRow: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 12 },
  timezoneRowActive: { backgroundColor: '#dbeafe' },
  timezoneName: { color: '#0f172a', fontSize: 14, fontWeight: '700' },
  timezoneMeta: { color: '#64748b', fontSize: 12, marginTop: 2 },
  empty: { color: '#94a3b8', fontSize: 13, paddingVertical: 16, textAlign: 'center' },
});
