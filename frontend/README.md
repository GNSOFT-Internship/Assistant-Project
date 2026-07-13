# Frontend

React 19 + Vite 기반 자산관리 시스템 프론트엔드입니다. 전체 프로젝트 설명, 실행 방법, 배포 안내는 [루트 README](../README.md)를 참고하세요.

## 개발 서버 실행

```bash
npm install
npm run dev
```

## 빌드

```bash
npm run build
```

## 테스트

```bash
npm test          # 1회 실행 (CI에서 사용)
npm run test:watch  # 감시 모드
```

Vitest + React Testing Library 기반으로 `src/**/*.test.{js,jsx}`에 위치합니다. 공용 유틸(`utils/format.js`, `utils/shortcut.js`), Toast/Confirm 컨텍스트, `Modal` 컴포넌트, 그리고 실제로 있었던 회귀 버그(널 상태에서 자산 상세 접근 시 크래시)를 재현하는 `AiAssistant` 페이지 테스트를 포함합니다. `backend-py`와 마찬가지로 GitHub Actions(`.github/workflows/frontend-tests.yml`)에서 `frontend/**` 변경 시 자동 실행됩니다.
