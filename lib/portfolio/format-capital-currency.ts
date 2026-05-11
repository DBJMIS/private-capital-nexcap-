/** Compact currency labels for capital structure UI (USD / JMD). */
export function formatCapitalCurrency(amount: number, currency: string): string {
  if (currency === 'JMD') {
    if (amount >= 1_000_000_000) {
      return `J$${(amount / 1_000_000_000).toFixed(1)}B`;
    }
    if (amount >= 1_000_000) {
      return `J$${(amount / 1_000_000).toFixed(1)}M`;
    }
    return `J$${amount.toLocaleString()}`;
  }
  if (amount >= 1_000_000) {
    return `US$${(amount / 1_000_000).toFixed(1)}M`;
  }
  return `US$${amount.toLocaleString()}`;
}
