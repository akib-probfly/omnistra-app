import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

const CHIME_SOURCE = require('../../assets/sounds/notification.wav');

let player: ReturnType<typeof createAudioPlayer> | null = null;
let modeConfigured = false;

async function ensurePlayer() {
  if (!player) {
    if (!modeConfigured) {
      try {
        await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' });
      } catch {
        // ignore audio mode failures; playback may still work
      }
      modeConfigured = true;
    }
    player = createAudioPlayer(CHIME_SOURCE);
  }
  return player;
}

export async function playMessageNotificationSound() {
  try {
    const p = await ensurePlayer();
    p.seekTo(0);
    p.play();
  } catch {
    // never let a notification sound failure affect the app
  }
}
