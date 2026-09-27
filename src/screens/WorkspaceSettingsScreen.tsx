import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, Save } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { showNotice } from '../components/AppToast';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { AppButton, AppSearchField, AppTextField, ScreenHeader } from '../ui';
import {
  fetchMyWorkspaces,
  fetchTimezones,
  formatGmtOffset,
  updateWorkspaceSettings,
  type TimezoneOption,
} from '../api/workspaces';
import { ErrorState } from '../components/ErrorState';
import { BottomSheet, SheetFlatList } from '../components/BottomSheet';
import { FormSkeleton, PanelSkeleton } from '../components/Skeleton';
import { fontSize, fontWeight, inputHeight, radius, spacing } from '../theme/tokens';

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
  }, [workspace]);

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
      showNotice('Workspace updated', 'Your workspace settings have been saved.');
    },
    onError: (error: Error) => showNotice('Could not update workspace', error.message),
  });

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Workspace"
        subtitle="Name, timezone, and workspace basics"
        onBack={() => navigation.goBack()}
      />

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
            <Text style={[styles.cardBody, { color: colors.textSecondary }]}>Update how this workspace appears across Zurvis.</Text>

            <AppTextField
              label="Workspace name"
              value={name}
              onChangeText={setName}
              placeholder="Workspace name"
              autoCapitalize="words"
              style={styles.workspaceNameField}
            />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Timezone</Text>
            <Pressable style={[styles.inputButton, { backgroundColor: colors.background, borderColor: colors.inputBorder }]} onPress={() => setTimezonePickerOpen(true)}>
              <Text style={[styles.inputButtonText, { color: colors.text }]} numberOfLines={1}>{timezone || 'Select timezone'}</Text>
            </Pressable>
          </View>

          <AppButton
            block
            icon={Save}
            label="Save changes"
            loading={saveMutation.isPending}
            disabled={!dirty || !name.trim()}
            onPress={() => saveMutation.mutate()}
          />
        </ScrollView>
      )}

      <BottomSheet visible={timezonePickerOpen} onClose={() => setTimezonePickerOpen(false)} sheetStyle={styles.sheetSurface}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>Select timezone</Text>
            <AppSearchField
              value={timezoneSearch}
              onChangeText={setTimezoneSearch}
              placeholder="Search timezone..."
              tone="background"
              fill={false}
            />
            {timezonesQuery.isLoading ? (
              <PanelSkeleton rows={5} />
            ) : (
              <SheetFlatList
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
        </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#f8fafc', flex: 1 },
  loader: { marginTop: 60 },
  content: { gap: spacing.md, padding: spacing.lg },
  card: { borderWidth: 1, padding: spacing.lg },
  cardIcon: { alignItems: 'center', borderRadius: radius.md, height: 40, justifyContent: 'center', marginBottom: spacing.md, width: 40 },
  cardTitle: { fontSize: fontSize.subheading, fontWeight: fontWeight.extrabold },
  cardBody: { fontSize: fontSize.small, marginTop: spacing.xs },
  workspaceNameField: { marginTop: spacing.md },
  label: { fontSize: fontSize.small, fontWeight: fontWeight.semibold, marginBottom: spacing.xs + 2, marginTop: spacing.md },
  inputButton: { borderRadius: radius.md, borderWidth: 1, minHeight: inputHeight, paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm },
  inputButtonText: { fontSize: fontSize.subheading, fontWeight: fontWeight.semibold },
  saveDisabled: { opacity: 0.5 },
  saveText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sheetOverlay: { backgroundColor: 'rgba(15,23,42,0.45)', flex: 1, justifyContent: 'flex-end' },
  sheetSurface: { paddingBottom: spacing.lg + 4, paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  sheetTitle: { fontSize: fontSize.heading, fontWeight: fontWeight.extrabold, marginBottom: spacing.md },
  timezoneRow: { borderRadius: radius.md, paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.md },
  timezoneRowActive: {},
  timezoneName: { fontSize: fontSize.subheading, fontWeight: fontWeight.bold },
  timezoneMeta: { fontSize: fontSize.caption, marginTop: 2 },
  empty: { fontSize: fontSize.small, paddingVertical: spacing.lg, textAlign: 'center' },
});
