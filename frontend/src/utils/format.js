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

// 대시보드 "최근 활동" 등에서 "5분 전", "3시간 전" 처럼 짧게 보여주기 위한 상대 시간 포맷.
// 하루가 넘어가면 절대 날짜(YYYY-MM-DD)로 바꿔서, 오래된 항목까지 "며칠 전"으로만 표시되어
// 언제인지 가늠하기 어려워지는 것을 막는다.
export function formatRelativeTime(dateInput) {
  if (!dateInput) return '-';
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return '-';

  const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSeconds < 60) return '방금 전';
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}일 전`;

  return date.toISOString().slice(0, 10);
}
