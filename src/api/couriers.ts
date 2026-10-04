import { apiFetch } from './client';

export type CourierConnection = {
  id: string;
  provider: string;
  displayName: string;
  status: 'PENDING' | 'CONNECTED' | 'ERROR' | 'DISABLED';
  providerConfig?: Record<string, unknown> | null;
  lastErrorMessage: string | null;
};

const DEFAULT_DELIVERY_FEES = { insideDhaka: 50, outsideDhaka: 100 } as const;

export function getCourierDeliveryFees(providerConfig?: Record<string, unknown> | null) {
  const rawFees = providerConfig?.deliveryFees;
  const fees = rawFees && typeof rawFees === 'object' && !Array.isArray(rawFees)
    ? rawFees as Record<string, unknown>
    : null;
  const parseFee = (value: unknown, fallback: number) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  return {
    insideDhaka: parseFee(fees?.insideDhaka, DEFAULT_DELIVERY_FEES.insideDhaka),
    outsideDhaka: parseFee(fees?.outsideDhaka, DEFAULT_DELIVERY_FEES.outsideDhaka),
  };
}

export function getCourierDeliveryZone(cityName?: string | null) {
  const normalized = cityName?.trim().toLowerCase();
  if (!normalized) return null;
  return normalized.includes('dhaka') ? 'INSIDE_DHAKA' as const : 'OUTSIDE_DHAKA' as const;
}

export type CourierShipment = {
  id: string;
  orderId?: string;
  courierConnectionId: string;
  provider?: string;
  courierName: string;
  providerShipmentId?: string | null;
  providerInvoice?: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  status: string;
  providerStatus?: string | null;
  codAmount?: number | null;
  deliveryCharge?: number | null;
  bookingRequestedAt?: string | null;
  bookedAt?: string | null;
  lastSyncedAt?: string | null;
  lastWebhookAt?: string | null;
  bookingErrorCode?: string | null;
  bookingErrorMessage: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export function listOrderShipments(orderId: string) {
  return apiFetch<{ items: CourierShipment[] }>(`/orders/${orderId}/shipments`, { method: 'GET' });
}

export async function listCourierConnections() {
  return apiFetch<{ items: CourierConnection[] }>('/courier-connections', { method: 'GET' });
}

export async function createCourierConnection(input: {
  provider: string;
  displayName: string;
  providerAccountId?: string;
  apiKey?: string;
  apiSecret?: string;
  username?: string;
  password?: string;
  providerConfig?: Record<string, unknown>;
}) {
  return apiFetch<CourierConnection>('/courier-connections', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function bookCourierShipment(orderId: string, input: {
  courierConnectionId: string;
  note?: string;
  alternativePhone?: string;
  itemDescription?: string;
  totalLot?: number;
  deliveryType?: number;
}) {
  return apiFetch<CourierShipment>(`/orders/${orderId}/shipments`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function syncCourierShipment(shipmentId: string) {
  return apiFetch<CourierShipment>(`/orders/shipments/${shipmentId}/sync`, {
    method: 'POST',
  });
}
