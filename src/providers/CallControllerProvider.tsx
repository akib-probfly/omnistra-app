import { createContext, useContext, type ReactNode } from 'react';
import { useWhatsappCallController } from '../hooks/useWhatsappCallController';

type WhatsappCallController = ReturnType<typeof useWhatsappCallController>;

const CallControllerContext = createContext<WhatsappCallController | null>(null);

export function CallControllerProvider({ children }: { children: ReactNode }) {
  const controller = useWhatsappCallController();
  return (
    <CallControllerContext.Provider value={controller}>
      {children}
    </CallControllerContext.Provider>
  );
}

export function useCallController() {
  const controller = useContext(CallControllerContext);
  if (!controller) {
    throw new Error('useCallController must be used within CallControllerProvider');
  }
  return controller;
}
