import { apiFetch } from './client';

export type CrmContactOwner = {
  workspaceMemberId: string;
  userName: string | null;
  userEmail: string;
};

export type CrmContactTag = {
  id: string;
  text: string;
  color?: string | null;
  isArchived?: boolean;
};

export type CrmContactListItem = {
  id: string;
  workspaceId?: string;
  displayName: string | null;
  avatarUrl: string | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
  source: string | null;
  channelName: string | null;
  channelNames?: string[];
  channelDisplayPhoneNumber: string | null;
  channelType: string | null;
  channelTypes?: string[];
  country?: string | null;
  ownerWorkspaceMemberId: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  tags: CrmContactTag[];
};

export type CrmContactNote = {
  id: string;
  body: string;
  authorMemberId: string;
  author: CrmContactOwner;
  createdAt: string;
  updatedAt: string;
};

export type CrmContactConversation = {
  id: string;
  status: 'OPEN' | 'ASSIGNED' | 'CLOSED';
  assignedWorkspaceMemberId: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  createdAt: string;
};

export type CrmContactDetail = CrmContactListItem & {
  conversations: CrmContactConversation[];
  notes: CrmContactNote[];
  companyName?: string | null;
};

export type CrmContactsListResponse = {
  items: CrmContactListItem[];
  totalCount: number;
  pageInfo?: { nextCursor?: string | null; hasMore?: boolean };
};

export type CrmContactsFilters = {
  workspaceId?: string;
  search?: string;
  ownerWorkspaceMemberIds?: string[];
  channelIds?: string[];
  tagIds?: string[];
  assigned?: boolean;
  unassigned?: boolean;
  recentlyActive?: boolean;
  cursor?: string;
  limit?: number;
};

function buildQueryString(params: Record<string, string | number | boolean | string[] | null | undefined>): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (Array.isArray(value)) {
      if (value.length === 0) return;
      query.set(key, value.map((item) => String(item)).join(','));
    } else if (value === true) {
      query.set(key, 'true');
    } else {
      query.set(key, String(value));
    }
  });
  const raw = query.toString();
  return raw ? `?${raw}` : '';
}

export function formatPhoneNumberDisplay(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('+') ? trimmed.slice(1).trimStart() : trimmed;
}

export function getContactTitle(contact: Pick<CrmContactListItem, 'displayName' | 'primaryPhone' | 'primaryEmail'>): string {
  return (
    contact.displayName?.trim()
    || formatPhoneNumberDisplay(contact.primaryPhone)
    || contact.primaryEmail?.trim()
    || 'Unnamed contact'
  );
}

export async function fetchCrmContacts(params: CrmContactsFilters = {}): Promise<CrmContactsListResponse> {
  return apiFetch<CrmContactsListResponse>(`/crm/contacts${buildQueryString({
    workspaceId: params.workspaceId,
    search: params.search,
    ownerWorkspaceMemberIds: params.ownerWorkspaceMemberIds,
    channelIds: params.channelIds,
    tagIds: params.tagIds,
    assigned: params.assigned,
    unassigned: params.unassigned,
    recentlyActive: params.recentlyActive,
    cursor: params.cursor,
    limit: params.limit ?? 20,
  })}`);
}

export async function fetchCrmContact(contactId: string): Promise<CrmContactDetail> {
  return apiFetch<CrmContactDetail>(`/crm/contacts/${contactId}`);
}

export async function createCrmContact(input: {
  workspaceId?: string;
  displayName: string;
  primaryPhone: string;
  phoneCountryCode?: string;
  phoneDialCode?: string;
  phoneNumber?: string;
  primaryEmail?: string | null;
  companyName?: string | null;
  source?: string | null;
  ownerWorkspaceMemberId?: string | null;
  tags?: string[];
  channels?: string[];
}): Promise<CrmContactDetail> {
  return apiFetch<CrmContactDetail>('/crm/contacts', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function updateCrmContactDetail(
  contactId: string,
  input: Partial<{
    displayName: string | null;
    primaryPhone: string | null;
    primaryEmail: string | null;
    companyName: string | null;
    source: string | null;
    ownerWorkspaceMemberId: string | null;
    tagIds: string[];
  }>,
): Promise<CrmContactDetail> {
  return apiFetch<CrmContactDetail>(`/crm/contacts/${contactId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  });
}

export async function addCrmContactNote(contactId: string, body: string): Promise<CrmContactNote> {
  return apiFetch<CrmContactNote>(`/crm/contacts/${contactId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  });
}

export async function deleteCrmContacts(input: {
  workspaceId?: string;
  contactIds?: string[];
  all?: boolean;
  expectedCount?: number;
}): Promise<{
  deletedCount: number;
  queuedCount?: number;
  deletionQueued?: boolean;
  storagePurgeTaskId?: string | null;
}> {
  return apiFetch('/crm/contacts/delete', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}
