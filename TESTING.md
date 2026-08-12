# 테스트 문서

이 문서는 (1) 이 프로젝트에 어떤 테스트가 있고 어떻게 실행하는지(과정), (2) 실제로 통과하는지와
이번 점검 기간에 발견한 버그들을 어떤 테스트로 재발 방지했는지(결과)를 함께 정리한다.

## 1. 테스트 구성

| 구분 | 위치 | 실행 명령 | 최근 결과 |
|---|---|---|---|
| 백엔드 (pytest) | `backend-py/tests/` | `cd backend-py && python -m pytest tests/ -q` | **161개 전체 통과** |
| 프론트엔드 (vitest) | `frontend/src/**/*.test.{js,jsx}` | `cd frontend && npx vitest run` | **111개 전체 통과** |

### 백엔드 테스트 파일 (18개)
`test_ai_gating.py`, `test_ai_search_and_recommendation.py`, `test_assets.py`, `test_auth.py`,
`test_budget_clamp.py`, `test_budgets.py`, `test_category_importance.py`, `test_chat.py`,
`test_client_ip.py`, `test_dashboard.py`, `test_files.py`, `test_permissions.py`, `test_qna_logic.py`,
`test_rate_limit.py`, `test_reports.py`, `test_scoring.py`, `test_startup_security.py`, `test_upload_limits.py`
(+ 픽스처 정의 `conftest.py`)

### 프론트엔드 테스트 파일 (16개)
`AiAssistant`, `AssetDetail`, `Assets`, `AuditLog`, `Budget`, `Dashboard`, `Login`,
`Maintenance`, `Recommendations`, `Reports` 각 페이지 + `Modal`, `ConfirmContext`, `ToastContext`,
`format`, `shortcut`, `services/api`(Axios 인터셉터) 공용 컴포넌트/유틸

`Assets` 페이지에는 원래 별도 페이지였던 "파일 업로드"(유지보수 내역서 엑셀/견적서 PDF
AI 분석) 기능이 통합되어 있고, 자산 등록용 엑셀 업로드까지 같은 드롭존에서 컬럼 구성만
보고 자동 판별하도록 더 확장되어 있어, 관련 테스트도 `Assets.test.jsx`/`test_files.py` 안에
함께 있다.

## 2. 자동 실행 체계 (과정)

테스트를 "돌리는 걸 잊는" 실수 자체가 구조적으로 어렵게 되어 있다:

1. **로컬 pre-push 훅** (`.githooks/pre-push` → `.git/hooks/pre-push`에 설치): `git push`할 때마다
   백엔드 pytest → 프론트엔드 vitest를 순서대로 자동 실행하고, 하나라도 실패하면 push 자체를 막는다.
   급하게 우회해야 하면 `git push --no-verify`를 쓰되 의도적으로만 사용한다.
2. **GitHub Actions CI** (`.github/workflows/ci.yml`): `main`으로 향하는 PR이 열리거나 갱신될 때마다,
   바뀐 쪽(`backend-py/` 변경 시 pytest, `frontend/` 변경 시 vitest)만 골라 자동으로 재실행한다.
   원래는 `main`에 push된 뒤(=머지된 뒤)에만 `deploy.yml`이 테스트를 돌렸는데, 테스트가 깨진 PR이
   그대로 머지되면 `main`이 깨진 채로 남고 배포도 막히는 문제가 실제로 있었다(아래 버그 표 참고).
   그래서 머지 "전" 단계에 이 워크플로를 별도로 추가했다. 로컬 훅과 역할이 겹치는 게 아니라, 로컬
   훅은 "push 이전에 더 빨리" 실패를 잡아주고 이 CI는 머지 직전의 최종 확인 역할을 한다.
3. **배포 직전 재확인** (`.github/workflows/deploy.yml`): `main`에 push되면(=머지되면) pytest/vitest를
   한 번 더 통과시킨 뒤에만 배포한다. PR 단계 CI(2번)와 같은 테스트를 또 도는 이유는, `--no-verify`로
   로컬 훅을 우회했거나 훅이 설치되지 않은 환경에서 push된 경우까지 대비한 이중 안전장치이기 때문이다.
4. **배포 후 검증** (`deploy.sh`): 테스트를 대신 돌려주진 않지만, 이미 검증된 커밋을 배포한 뒤 실제
   사이트/API 응답과 백엔드 트레이스백 여부를 자동으로 확인한다.

## 3. 이번 점검 기간에 발견·수정한 버그와 회귀 테스트 (결과)

아래는 최근 세션에서 코드를 직접 열어 확인해 발견한 버그들과, 재발을 막기 위해 추가한 테스트다.
전부 "고침 → 회귀 테스트 추가 → 전체 스위트 통과 확인 → 배포 후 실제 API/화면 검증" 순서를 거쳤다.

| # | 버그 | 커밋 | 추가된 테스트 | 결과 |
|---|---|---|---|---|
| 1 | 파일 업로드 시 전체를 메모리에 읽어 `MemoryMax` OOM 위험 | `11bf295` | (기존 파일 업로드 테스트로 회귀 확인) + 실제 업로드/삭제 API 왕복으로 프로덕션에서 직접 검증 | ✅ |
| 2 | 대시보드 통계가 전체 테이블을 파이썬으로 퍼올려 계산 | `8b48163` | `test_dashboard.py` 기존 테스트로 결과 동등성 확인 | ✅ |
| 3 | 예산 저장 동시 요청 시 유니크 제약 충돌로 500 | `7f838a8` | `test_budgets.py` (기존 CRUD 테스트로 회귀 확인, 동시성 자체는 코드 리뷰로 검증) | ✅ |
| 4 | 자산 상세의 "누적 수리비"/"유지보수 건수"가 100건 이후 축소 표시 | `f99349b` | `test_maintenance_total_cost_reflects_all_records_not_just_the_returned_page` (백엔드), `shows the server-aggregated total count/cost, not just the loaded page length` (프론트) | ✅ |
| 5 | AI 어시스턴트가 응답 대기 중에도 중복 질문 전송 가능 | `e626029` | 기존 `AiAssistant.test.jsx` 스위트로 회귀 확인 + 브라우저에서 로딩 중 입력/버튼 비활성화 직접 확인 | ✅ |
| 6 | 자산 카테고리 8종 하드코딩 (엑셀 일괄 등록 시 그 목록에 없는 카테고리 누락) | `e626029` | `test_asset_categories_endpoint_reflects_actual_data_not_a_hardcoded_list` (백엔드) + 브라우저에서 새 카테고리 자유 입력 확인 | ✅ |
| 7 | 예산 배정 금액에 음수 허용 (다른 금액 필드와 달리 검증 누락) | `1a03868` | `test_set_budget_rejects_negative_amount` | ✅ |
| 8 | 유지보수 분석 평균비용 타입 불일치, AI 진단 스트림 중 오류 문구가 답변에 이어붙음 | `69f7bd3` | 기존 `test_ai_gating.py`/`test_ai_search_and_recommendation.py` 스위트로 회귀 확인 (사소한 다듬기라 별도 테스트는 추가하지 않음) | ✅ |
| 9 | `main`으로 향하는 PR에 머지 전 CI가 없어, 테스트가 깨진 PR이 그대로 머지되면 `main`이 배포 불가 상태로 남음 (실제로 한 번 발생) | `eba7aa4` | 별도 테스트가 아니라 워크플로 자체(`ci.yml`)가 회귀 방지 장치 | ✅ |
| 10 | 자산 `category` 앞뒤 공백 미제거 → "NAS"와 "NAS "가 DB상 다른 값으로 취급되어 필터/그룹핑 및 `category_importance` 캐시가 갈라짐 | `08d8548` | `test_create_asset_strips_whitespace_from_category`, `test_create_asset_rejects_blank_category` | ✅ |
| 11 | 대시보드 상위 교체 필요 목록이 카테고리 중요도를 반영하지 않고 항상 기본값(50.0)으로 계산 (추천/보고서 페이지와 계산식이 어긋남) | `5dd122a` | 기존 `test_dashboard.py` 스위트로 회귀 확인 | ✅ |
| 12 | 배치 업로드가 파일 전체를 메모리에 올려 `MemoryMax` 보호가 다중 파일에는 적용되지 않음 | `5dd122a` | 기존 `test_files.py` 스위트로 회귀 확인 | ✅ |
| 13 | 배치 적용 중 일부 파일 처리가 실패해도 그 파일이 만든 레코드가 배치 끝의 단일 커밋에 함께 반영됨 (실패한 파일의 변경이 롤백되지 않음) | `5dd122a` | 기존 `test_files.py` 스위트로 회귀 확인 | ✅ |

이전 세션에서 고친 항목(참고용, 이번 정리 대상 밖):
파일 재적용 중복 방지, 예산 시뮬레이션 카테고리 누락, 예산 0원 배지 버그, 챗봇 자동 스크롤 방해 등도
각각 대응하는 회귀 테스트가 이미 스위트에 포함되어 있다 (`test_files.py`의
`test_reprocessing_an_applied_file_is_rejected` 등).

## 4. 자동화 테스트로 잡기 어려운 부분의 검증 방식

- **동시성/레이스 컨디션**(#3): pytest로 진짜 동시 요청을 재현하기는 번거로워, 코드 리뷰(트랜잭션 순서 확인)로
  검증했다. 실제 운영에서 재현되면 로그(`journalctl -u asset-backend`)로 확인 가능하다.
  Skip: 이번 세션에서는 이 방식으로 충분하다고 판단했다.
- **배포 자체가 제대로 되는지**: `deploy.sh`가 배포 직후 사이트 200/API 401 응답과 프론트 번들 해시 일치
  여부를 자동 확인한다 (pytest/vitest와 별개의 검증 계층).
- **브라우저에서만 확인 가능한 것**(입력창 비활성화, datalist 자동완성 등): 로컬 dev 서버를 띄워
  `document.querySelector`로 DOM 상태를 직접 확인하는 방식으로 검증했다.

## 5. 알려진 한계

- 로그인 페이지(`frontend/src/pages/Login.jsx`)에 기본 계정 정보(`admin/admin123`, `user/user123`)가 화면에
  그대로 노출되어 있다. 데모/시연 목적으로 의도적으로 남겨둔 상태이며, 테스트로 잡을 성격의 문제가 아니라
  별도로 제거가 필요하다는 점만 기록해 둔다.
