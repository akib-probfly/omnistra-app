import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { useCallback, useEffect, useRef } from 'react';

type RingtoneKind = 'incoming' | 'outgoing';

const INCOMING_SOURCE = require('../../assets/sounds/incoming.mp3');

export function useCallRingtone() {
  const playerRef = useRef<ReturnType<typeof createAudioPlayer> | null>(null);
  const activeKindRef = useRef<RingtoneKind | null>(null);

  const ensurePlayer = useCallback(async () => {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: 'doNotMix',
      allowsRecording: false,
    });
    if (!playerRef.current) {
      const player = createAudioPlayer(INCOMING_SOURCE);
      player.loop = true;
      player.volume = 0.85;
      playerRef.current = player;
    }
    return playerRef.current;
  }, []);

  const stop = useCallback(() => {
    const player = playerRef.current;
    activeKindRef.current = null;
    if (!player) return;
    try {
      player.pause();
      player.seekTo(0);
    } catch {
      // already stopped
    }
  }, []);

  const play = useCallback(async (kind: RingtoneKind) => {
    if (kind !== 'incoming') {
      stop();
      return;
    }
    if (activeKindRef.current === kind && playerRef.current?.playing) {
      return;
    }
    const player = await ensurePlayer();
    if (!player) return;
    try {
      player.loop = true;
      player.seekTo(0);
      player.play();
      activeKindRef.current = kind;
    } catch {
      activeKindRef.current = null;
    }
  }, [ensurePlayer, stop]);

  useEffect(() => () => {
    stop();
    try {
      playerRef.current?.remove();
    } catch {
      // ignore
    }
    playerRef.current = null;
  }, [stop]);

  return { play, stop };
}
