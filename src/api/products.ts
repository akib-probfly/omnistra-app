import { apiFetch } from './client';

export type ProductSalesChannel = {
  channelId: string;
  channelName: string;
  channelType: string;
  catalogId: string | null;
  catalogName: string | null;
};

export type ProductResponse = {
  id: string;
  workspaceId: string;
  name: string;
  sku: string | null;
  categoryId: string | null;
  category: string | null;
  descriptionMarkdown: string | null;
  shortDescription: string | null;
  coverImageUrl: string | null;
  imageUrls: string[];
  currency: string | null;
  priceMinor: number | null;
  salePriceMinor: number | null;
  salePriceStartsAt: string | null;
  salePriceEndsAt: string | null;
  weightGrams: number | null;
  dimensions: Record<string, unknown> | null;
  inventory: number | null;
  stockAlert: number | null;
  attributes: unknown[] | null;
  status: string;
  managementMode: string;
  salesChannels: ProductSalesChannel[];
  createdAt: string;
  updatedAt: string;
};

export type ProductListResponse = {
  items: ProductResponse[];
  total: number;
};

export type ProductInput = {
  name: string;
  sku?: string;
  categoryId?: string;
  category?: string;
  description?: string;
  shortDescription?: string;
  currency?: string;
  basePrice?: string;
  salePrice?: string;
  weight?: string;
  dimensionL?: string;
  dimensionW?: string;
  dimensionH?: string;
  isActive?: boolean;
  initialStock?: number;
  stockAlert?: number;
  imageUrls?: string[];
  imageAttachmentIds?: string[];
  attributes?: Array<{ name: string; values: string }>;
  whatsappCatalogs?: Array<{ channelId: string; catalogId: string }>;
};

export async function listProducts(params?: {
  search?: string;
  category?: string | string[];
  status?: string | string[];
  page?: number;
  limit?: number;
}) {
  const query = new URLSearchParams();
  const serialize = (value: string | string[]) => Array.isArray(value) ? value.join(',') : value;
  if (params?.search) query.set('search', params.search);
  if (params?.category) query.set('category', serialize(params.category));
  if (params?.status) query.set('status', serialize(params.status));
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  const suffix = query.toString() ? `?${query.toString()}` : '';
  return apiFetch<ProductListResponse>(`/products${suffix}`);
}

export function fetchProduct(productId: string) {
  return apiFetch<ProductResponse>(`/products/${productId}`);
}

export function createProduct(input: ProductInput) {
  return apiFetch<ProductResponse>('/products', { method: 'POST', body: JSON.stringify(input) });
}

export function updateProduct(productId: string, input: ProductInput) {
  return apiFetch<ProductResponse>(`/products/${productId}`, { method: 'PATCH', body: JSON.stringify(input) });
}

export function updateProductStatus(productId: string, isActive: boolean, whatsappChannelIds?: string[]) {
  return apiFetch<ProductResponse>(`/products/${productId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive, whatsappChannelIds }),
  });
}

export function deleteProduct(productId: string) {
  return apiFetch<void>(`/products/${productId}`, { method: 'DELETE' });
}
