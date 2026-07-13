// 배정 예산이 극단적으로 작은 값(예: 1원)으로 잘못 입력된 경우
// 소진율이 수천만 %까지 치솟아 화면 레이아웃이 깨질 수 있어 상한선을 둔다.
const PERCENT_DISPLAY_CAP = 999;

export function formatPercent(rate, { decimals = 1 } = {}) {
  if (rate == null || Number.isNaN(rate)) return '-';
  if (rate > PERCENT_DISPLAY_CAP) return `${PERCENT_DISPLAY_CAP}%+`;
  return `${rate.toFixed(decimals)}%`;
}
