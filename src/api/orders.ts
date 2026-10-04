import { apiFetch } from './client';

export type OrderStatus = 'PENDING' | 'APPROVED' | 'PROCESSING' | 'SHIPPED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED' | 'RETURNED' | 'DAMAGED';
export const ORDER_STATUS_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ['APPROVED', 'CANCELLED'], APPROVED: ['SHIPPED', 'CANCELLED'], PROCESSING: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['IN_TRANSIT', 'CANCELLED'], IN_TRANSIT: ['DELIVERED', 'CANCELLED'], DELIVERED: ['RETURNED'],
  CANCELLED: ['PENDING'], RETURNED: ['PENDING', 'DAMAGED'], DAMAGED: [],
};
export const getAllowedOrderStatusTransitions = (status: OrderStatus) => ORDER_STATUS_TRANSITIONS[status] ?? [];
export type OrderSummary = {
  id: string; orderNumber: string; status: OrderStatus;
  createdBy: { name: string; email: string; role: string | null } | null;
  source: { type: string; name: string; displayPhoneNumber: string | null };
  date: string; total: number; matchScore?: number;
  recipient: { name: string; phone: string; address: string; payment: string };
  items: Array<{ name: string; qty: number; price: number; imageUrl: string | null }>;
  courier: { connectionId?: string; partner: string; tracking: string; status: string } | null;
};
export type OrderLocationOption = { id: string; name: string };
export type CreateOrderInput = {
  sourceChannelId: string; courierConnectionId: string | null; recipientName: string; recipientPhone: string;
  recipientEmail: string | null; address: string; cityId: string | null; zoneId: string | null; areaId: string | null; currency: string;
  paymentMethod: 'COD' | 'PAID' | 'PARTIAL'; amountPaidMinor: number; deliveryFeeMinor: number;
  items: Array<
    | { productId: string; productVariantId?: string | null; quantity: number; unitPriceMinor: number; weightGrams: number | null }
    | { productId: null; productVariantId?: null; productName: string; variantLabel?: string | null; quantity: number; unitPriceMinor: number; weightGrams: number | null }
  >;
};
export async function listOrders(params: { search?: string; phone?: string; source?: string | string[]; status?: OrderStatus; page?: number; limit?: number } = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set('search', params.search);
  if (params.phone) query.set('phone', params.phone);
  if (params.source) query.set('source', Array.isArray(params.source) ? params.source.join(',') : params.source);
  if (params.status) query.set('status', params.status);
  if (params.page) query.set('page', String(params.page));
  if (params.limit) query.set('limit', String(params.limit));
  return apiFetch<{ items: OrderSummary[]; total: number; statusCounts: Record<string, number> }>(`/orders${query.size ? `?${query}` : ''}`);
}
export function createOrder(input: CreateOrderInput) {
  return apiFetch<{ id: string; orderNumber: string; status: OrderStatus }>('/orders', { method: 'POST', body: JSON.stringify(input) });
}
export function updateOrderStatus(orderId: string, status: OrderStatus) {
  return apiFetch<{ id: string; orderNumber: string; status: OrderStatus }>(`/orders/${orderId}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
}
export function bulkUpdateOrderStatus(orderIds: string[], status: OrderStatus) {
  return apiFetch<{ items: Array<{ id: string; status: OrderStatus }> }>('/orders/status', { method: 'PATCH', body: JSON.stringify({ orderIds, status }) });
}
export function scanOrder(code: string) {
  return apiFetch<{ order: OrderSummary; previousStatus: string; changed: boolean; action: 'SHIPPED' | 'RETURNED' | 'NONE'; message: string }>('/orders/scan', { method: 'POST', body: JSON.stringify({ code }) });
}
export function listOrderInvoices(orderIds: string[]) {
  return apiFetch<{ items: Array<{ id: string; orderNumber: string; status: string; currency: string; createdAt: string; recipient: { name: string; phone: string; email: string | null; address: string }; payment: string; subtotal: number; discount: number; deliveryFee: number; total: number; amountPaid: number; dueAmount: number; items: Array<{ name: string; weightGrams: number | null; qty: number; unitPrice: number; amount: number }> }> }>(`/orders/invoices?orderIds=${encodeURIComponent(orderIds.join(','))}`);
}
export function listOrderCities(search?: string) {
  return apiFetch<{ items: OrderLocationOption[] }>(`/orders/locations/cities${search ? `?search=${encodeURIComponent(search)}` : ''}`);
}
export function listOrderZones(cityId: string, search?: string) {
  const query = new URLSearchParams({ cityId }); if (search) query.set('search', search);
  return apiFetch<{ items: OrderLocationOption[] }>(`/orders/locations/zones?${query}`);
}
export function listOrderAreas(zoneId: string, search?: string) {
  const query = new URLSearchParams({ zoneId }); if (search) query.set('search', search);
  return apiFetch<{ items: OrderLocationOption[] }>(`/orders/locations/areas?${query}`);
}
