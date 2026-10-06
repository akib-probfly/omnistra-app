export function sanitizeMoneyInput(value: string): string {
  const normalized = value.replace(/[^\d.]/g, '');
  const decimalIndex = normalized.indexOf('.');
  if (decimalIndex < 0) return normalized;
  const whole = normalized.slice(0, decimalIndex);
  const fraction = normalized.slice(decimalIndex + 1).replace(/\./g, '').slice(0, 2);
  return `${whole}.${fraction}`;
}
