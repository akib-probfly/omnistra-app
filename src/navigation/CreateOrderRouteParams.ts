export type CreateOrderRouteParams = {
  initialItems?: Array<{
    productId: string;
    name: string;
    imageUrl?: string | null;
    quantity: number;
    unitPriceMinor?: number | null;
    weightGrams?: number | null;
  }>;
  initialRecipient?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  };
  initialSourceChannelId?: string;
  presentation?: 'sheet';
} | undefined;
