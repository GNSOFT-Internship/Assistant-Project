import '@testing-library/jest-dom';

// jsdom은 레이아웃을 계산하지 않아 scrollIntoView 등 일부 DOM API가 구현되어
// 있지 않다. 채팅/모달류 컴포넌트가 이 API를 호출하므로 테스트 환경에서
// 최소한 예외 없이 동작하도록 스텁을 채워준다.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}
