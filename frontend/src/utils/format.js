// 배정 예산이 극단적으로 작은 값(예: 1원)으로 잘못 입력된 경우
// 소진율이 수천만 %까지 치솟아 화면 레이아웃이 깨질 수 있어 상한선을 둔다.
const PERCENT_DISPLAY_CAP = 999;

export function formatPercent(rate, { decimals = 1 } = {}) {
  if (rate == null || Number.isNaN(rate)) return '-';
  if (rate > PERCENT_DISPLAY_CAP) return `${PERCENT_DISPLAY_CAP}%+`;
  return `${rate.toFixed(decimals)}%`;
}

// 앱 전체에서 금액은 "1,234,000원" 형식으로 통일한다 (일부 화면에서만 "₩1,234,000"을
// 쓰던 것을 정리 — 같은 개념이 페이지마다 다르게 보이지 않도록).
export function formatCurrency(amount) {
  if (amount == null || Number.isNaN(amount)) return '-';
  return `${Math.round(amount).toLocaleString()}원`;
}
