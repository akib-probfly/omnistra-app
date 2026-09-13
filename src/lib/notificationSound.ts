import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { NotificationType } from '../api/notifications';

const TONE_SOURCES = {
  message: require('../../assets/sounds/message.wav'),
  assignment: require('../../assets/sounds/assignment.wav'),
  unassignment: require('../../assets/sounds/unassignment.wav'),
  call: require('../../assets/sounds/incoming.mp3'),
  export: require('../../assets/sounds/export.wav'),
  sent: require('../../assets/sounds/sent.wav'),
} as const;

type ToneKey = keyof typeof TONE_SOURCES;

const players = new Map<ToneKey, ReturnType<typeof createAudioPlayer>>();
let modeConfigured = false;
let modePromise: Promise<void> | null = null;
let soundsSuppressed = false;
let ringtoneGeneration = 0;

async function ensureMode() {
  if (modeConfigured) return;
  if (!modePromise) {
    modePromise = setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
    }).then(() => { modeConfigured = true; }).finally(() => { modePromise = null; });
  }
  await modePromise;
}

// Drain pending ringtone configuration before WebRTC takes session ownership.
export async function suppressCallSounds(suppressed: boolean) {
  soundsSuppressed = suppressed;
  if (suppressed) {
    stopIncomingCallRingtone();
    for (const player of players.values()) {
      try { player.pause(); } catch { /* already stopped */ }
    }
    await modePromise?.catch(() => {});
  } else {
    modeConfigured = false;
  }
}

async function playTone(tone: ToneKey) {
  if (soundsSuppressed) return;
  const generation = ringtoneGeneration;
  try {
    await ensureMode();
    if (soundsSuppressed || generation !== ringtoneGeneration) return;
    let player = players.get(tone);
    if (!player) {
      player = createAudioPlayer(TONE_SOURCES[tone], { keepAudioSessionActive: true });
      players.set(tone, player);
    }
    player.seekTo(0);
    player.play();
  } catch {
    // never let a notification sound failure affect the app
  }
}

export async function playNotificationSound(type: NotificationType | string = 'NEW_MESSAGE') {
  if (type !== 'INCOMING_CALL') return;
  await playTone('call');
}

let ringingPlayer: ReturnType<typeof createAudioPlayer> | null = null;

export async function startIncomingCallRingtone() {
  if (soundsSuppressed) return;
  const generation = ringtoneGeneration;
  try {
    await ensureMode();
    if (soundsSuppressed || generation !== ringtoneGeneration) return;
    if (ringingPlayer?.playing) return;
    if (!ringingPlayer) {
      ringingPlayer = createAudioPlayer(TONE_SOURCES.call, { keepAudioSessionActive: true });
      ringingPlayer.loop = true;
      ringingPlayer.volume = 0.85;
    }
    ringingPlayer.seekTo(0);
    ringingPlayer.play();
  } catch {
    // never let a ringtone failure affect the app
  }
}

export function stopIncomingCallRingtone() {
  ringtoneGeneration += 1;
  const player = ringingPlayer;
  ringingPlayer = null;
  if (!player) return;
  try {
    player.pause();
    player.seekTo(0);
    player.remove();
  } catch {
    // already stopped
  }
}

/** Outbound message tones are disabled; incoming calls use playNotificationSound. */
export async function playMessageSentSound() {
  return;
}

/** @deprecated Prefer playNotificationSound(type) */
export async function playMessageNotificationSound() {
  await playNotificationSound('NEW_MESSAGE');
}
