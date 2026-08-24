export type CheckoutReturn = {
  result: 'success' | 'cancel';
  planKey?: string;
  reference?: string;
};

function readQuery(url: URL, keys: string[]) {
  for (const key of keys) {
    const value = url.searchParams.get(key)?.trim();
    if (value) return value;
  }
  return undefined;
}

export function parseCheckoutReturnUrl(rawUrl: string): CheckoutReturn | null {
  if (!rawUrl) return null;

  try {
    const normalized = rawUrl
      .replace(/^osaas:\/\//i, 'https://osaas.app/')
      .replace(/^exp\+[^:]+:\/\//i, 'https://osaas.app/');
    const parsed = new URL(normalized);
    const path = parsed.pathname.replace(/\/+$/, '') || '/';
    const planKey = readQuery(parsed, ['planKey']) ?? path.split('/').filter(Boolean).at(-2);
    const reference = readQuery(parsed, ['reference', 'pp_reference', 'pp_id', 'ppid']);

    if (
      path === '/billing/success'
      || path.endsWith('/workspace-settings/billing/success')
      || /\/workspace-settings\/billing\/[^/]+\/success$/.test(path)
    ) {
      return { result: 'success', planKey, reference };
    }

    if (path === '/billing/cancel') {
      return { result: 'cancel', planKey: readQuery(parsed, ['planKey']) };
    }

    const planPage = path.match(/\/workspace-settings\/billing\/([^/]+)$/);
    if (planPage) {
      return { result: 'cancel', planKey: planPage[1] };
    }

    return null;
  } catch {
    return null;
  }
}

export function isHttpUrl(url: string) {
  return /^https?:\/\//i.test(url);
}
