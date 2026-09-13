import { useCallback, useEffect } from 'react';
import { startIncomingCallRingtone, stopIncomingCallRingtone } from '../lib/notificationSound';

type RingtoneKind = 'incoming' | 'outgoing';

export function useCallRingtone() {
  const play = useCallback(async (kind: RingtoneKind) => {
    if (kind === 'incoming') {
      await startIncomingCallRingtone();
    } else {
      stopIncomingCallRingtone();
    }
  }, []);

  useEffect(() => stopIncomingCallRingtone, []);

  return { play, stop: stopIncomingCallRingtone };
}
