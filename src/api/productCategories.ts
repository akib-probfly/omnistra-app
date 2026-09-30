import { apiFetch } from './client';
export type ProductCategory = { id: string; workspaceId: string; name: string; normalizedName: string };
export function fetchProductCategories(workspaceId?: string) {
  const query = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
  return apiFetch<{ items: ProductCategory[] }>(`/products/categories${query}`);
}
export function createProductCategory(name: string, workspaceId?: string) {
  return apiFetch<ProductCategory>('/products/categories', { method: 'POST', body: JSON.stringify({ name, workspaceId }) });
}
