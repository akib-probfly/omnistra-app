import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { NotificationType } from '../api/notifications';

const TONE_SOURCES = {
  message: require('../../assets/sounds/message.wav'),
  assignment: require('../../assets/sounds/assignment.wav'),
  unassignment: require('../../assets/sounds/unassignment.wav'),
  call: require('../../assets/sounds/call.wav'),
  export: require('../../assets/sounds/export.wav'),
  sent: require('../../assets/sounds/sent.wav'),
} as const;

type ToneKey = keyof typeof TONE_SOURCES;

const players = new Map<ToneKey, ReturnType<typeof createAudioPlayer>>();
let modeConfigured = false;

function toneForNotificationType(type: NotificationType | string): ToneKey {
  switch (type) {
    case 'CONVERSATION_ASSIGNED':
      return 'assignment';
    case 'CONVERSATION_UNASSIGNED':
      return 'unassignment';
    case 'INCOMING_CALL':
      return 'call';
    case 'CONTACT_EXPORT_READY':
    case 'CAMPAIGN_EXPORT_READY':
      return 'export';
    case 'NEW_MESSAGE':
    default:
      return 'message';
  }
}

async function ensureMode() {
  if (modeConfigured) return;
  try {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
  } catch {
    // playback may still work
  }
  modeConfigured = true;
}

async function playTone(tone: ToneKey) {
  try {
    await ensureMode();
    let player = players.get(tone);
    if (!player) {
      player = createAudioPlayer(TONE_SOURCES[tone]);
      players.set(tone, player);
    }
    player.seekTo(0);
    player.play();
  } catch {
    // never let a notification sound failure affect the app
  }
}

export async function playNotificationSound(type: NotificationType | string = 'NEW_MESSAGE') {
  await playTone(toneForNotificationType(type));
}

/** Soft confirmation when the agent successfully sends a message. */
export async function playMessageSentSound() {
  await playTone('sent');
}

/** @deprecated Prefer playNotificationSound(type) */
export async function playMessageNotificationSound() {
  await playNotificationSound('NEW_MESSAGE');
}
