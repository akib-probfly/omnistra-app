export type CreateOrderRouteParams = {
  initialRecipient?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  };
  initialSourceChannelId?: string;
  presentation?: 'sheet';
} | undefined;
