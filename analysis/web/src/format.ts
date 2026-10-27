const nf = new Map<number, Intl.NumberFormat>();
export function num(value: unknown, digits = 2) {
  if (value === null || value === undefined || value === '') return '–';
  if (typeof value !== 'number') return String(value);
  if (!Number.isFinite(value)) return '–';
  const d = Number.isInteger(value) ? 0 : digits;
  if (!nf.has(d)) nf.set(d, new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));
  return nf.get(d)!.format(value);
}
export const pct = (value: number | null | undefined, digits = 1) => (value === null || value === undefined || !Number.isFinite(value) ? '–' : `${num(value * 100, digits)} %`);
export const signed = (value: number, digits = 2) => (Number.isFinite(value) && value > 0 ? `+${num(value, digits)}` : num(value, digits));
