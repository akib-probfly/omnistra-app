import type { Channel } from '../api/channels';

export type ChannelFilterItem = {
  key: string;
  channelId: string;
  name: string;
  displayPhoneNumber: string | null;
};

export type ChannelTypeGroup = {
  typeKey: string;
  typeName: string;
  type: string | null;
  channels: ChannelFilterItem[];
};

export function getChannelTypeLabel(type: string | null) {
  switch ((type ?? '').toLowerCase()) {
    case 'whatsapp':
      return 'WhatsApp';
    case 'messenger':
      return 'Messenger';
    case 'instagram':
      return 'Instagram';
    case 'telegram':
      return 'Telegram';
    case 'email':
      return 'Email';
    case 'webchat':
      return 'Web';
    case 'sms':
      return 'SMS';
    case 'tiktok':
      return 'TikTok';
    default:
      return type ?? 'Channel';
  }
}

export function getChannelTypeSortRank(type: string | null) {
  switch ((type ?? '').toLowerCase()) {
    case 'whatsapp':
      return 0;
    case 'messenger':
      return 1;
    case 'instagram':
      return 2;
    case 'telegram':
      return 3;
    case 'email':
      return 4;
    case 'webchat':
      return 5;
    case 'sms':
      return 6;
    case 'tiktok':
      return 7;
    default:
      return 99;
  }
}

export function toggleChannelIds(current: string[], ids: string[], selected: boolean) {
  if (selected) return current.filter((id) => !ids.includes(id));
  return Array.from(new Set([...current, ...ids]));
}

export function groupChannelsByType(channels: Channel[]): ChannelTypeGroup[] {
  const groups = new Map<string, ChannelTypeGroup>();

  for (const channel of channels) {
    const type = channel.type ?? null;
    const typeName = type ? getChannelTypeLabel(type) : 'Channel';
    const typeKey = type ?? 'unknown';
    const primaryAccount = channel.accounts.find((account) => account.isEnabled) ?? channel.accounts[0] ?? null;
    const numbers = channel.accounts
      .map((account) => account.displayPhoneNumber?.trim() || account.displayName?.trim() || account.pageName?.trim() || account.externalAccountId?.trim() || '')
      .filter(Boolean);
    const displayPhoneNumber = numbers[0] ?? primaryAccount?.displayName?.trim() ?? primaryAccount?.pageName?.trim() ?? null;

    if (!groups.has(typeKey)) {
      groups.set(typeKey, { typeKey, typeName, type, channels: [] });
    }

    groups.get(typeKey)!.channels.push({
      key: channel.id,
      channelId: channel.id,
      name: channel.name,
      displayPhoneNumber,
    });
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      channels: group.channels.slice().sort((left, right) =>
        left.name.localeCompare(right.name) || (left.displayPhoneNumber ?? '').localeCompare(right.displayPhoneNumber ?? ''),
      ),
    }))
    .sort((left, right) => {
      const orderDiff = getChannelTypeSortRank(left.type) - getChannelTypeSortRank(right.type);
      return orderDiff !== 0 ? orderDiff : left.typeName.localeCompare(right.typeName);
    });
}

export function filterChannelTypeGroups(groups: ChannelTypeGroup[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return groups;

  return groups
    .map((group) => ({
      ...group,
      channels: group.channels.filter((channel) => (
        group.typeName.toLowerCase().includes(normalized)
        || channel.name.toLowerCase().includes(normalized)
        || (channel.displayPhoneNumber ?? '').toLowerCase().includes(normalized)
      )),
    }))
    .filter((group) => group.channels.length > 0);
}
