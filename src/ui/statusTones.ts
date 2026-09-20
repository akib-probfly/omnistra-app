import type { BadgeTone } from './AppBadge';

const SUCCESS_HINTS = [
  'active', 'activated', 'connected', 'delivered', 'paid', 'sent',
  'success', 'successful', 'complete', 'completed', 'verified', 'synced',
  'live', 'enabled', 'online', 'resolved', 'published',
];

const WARNING_HINTS = [
  'pending', 'paused', 'pausing', 'trial', 'trialing', 'changing',
  'unreached', 'sending', 'scheduled', 'canceled', 'cancelled', 'expiring',
  'limited', 'action_required',
];

const DANGER_HINTS = [
  'failed', 'failure', 'expired', 'error', 'errors', 'disabled',
  'rejected', 'blocked', 'past_due', 'unsubscribed',
];

const INFO_HINTS = [
  'invited', 'invite', 'info', 'read', 'replied', 'new', 'draft_state',
];

/**
 * Maps a backend status string to an `AppBadge` tone via keyword matching.
 * Replaces the per-screen `{ bg, text }` hex helpers that each broke dark
 * mode in their own way. Domains with explicit status vocabularies (campaign
 * lifecycle, member roster) keep tiny explicit mappers and only fall back to
 * this for unknown values.
 */
export function toneForStatus(status: string | null | undefined): BadgeTone {
  const value = (status ?? '').toLowerCase();
  if (!value || value === 'none' || value === 'unknown') return 'neutral';
  if (SUCCESS_HINTS.some((hint) => value.includes(hint))) return 'success';
  if (DANGER_HINTS.some((hint) => value.includes(hint))) return 'danger';
  if (WARNING_HINTS.some((hint) => value.includes(hint))) return 'warning';
  if (INFO_HINTS.some((hint) => value.includes(hint))) return 'info';
  return 'neutral';
}
