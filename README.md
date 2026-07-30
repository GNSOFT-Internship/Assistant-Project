# 공공시설 유지보수 및 자산관리 AI 시스템

본 시스템은 공공시설의 자산 등록/조회/수정/삭제 등의 기본 관리 기능부터, 월별 유지보수 예산 수립·예측·시뮬레이션, AI 기반의 자연어 검색 및 유지보수 분석, 교체 대상 자산 추천, AI 작업 지시서·조달 규격서·고장 진단 챗봇, PDF 견적서 자동 인식 및 자동 등록, AI Q&A 및 월간 보고서 생성 등의 지능형 기능을 제공하는 종합 자산 관리 플랫폼입니다.

## 아키텍처
- **Backend**: FastAPI (Python), SQLAlchemy, REST API, Qwen3.5 (사내 GPU 서버, gn-cab 게이트웨이)
- **Frontend**: React (Vite, Tailwind CSS)
- **DB**: MySQL / MariaDB

백엔드는 Python 단일 서비스로 통일되어 있으며, 자연어 검색 · 교체 우선순위 추천 · 유지보수 분석 · 예산 예측/시뮬레이션 · 작업 지시서 · 조달 규격서 · 고장 진단 · 보고서 서술 · Q&A는 모두 LLM을 호출하여 작동합니다. `GN_API_KEY`가 설정되어 있으면 사내 GPU 서버의 Qwen3.5(gn-cab, OpenAI 호환 엔드포인트)를 사용합니다. 설정되지 않은 경우, 각 기능은 규칙 기반 폴백(Fallback)으로 동작하여 개발 및 데모 환경에서 키 없이도 시스템 기동 및 기본 시뮬레이션이 가능합니다. gn-cab API 키 자체가 분당 호출 횟수 제한이 있어, AI를 실제로 호출하는 엔드포인트에는 서버단 요청 제한(Rate Limiting)이 함께 걸려 있습니다.

---

## 주요 기능

### 1. 자산 관리 & 변경 이력 추적
- **자산 CRUD**: 자산 등록/수정/삭제/조회 기능 제공.
- **서버사이드 페이지네이션, 정렬 & 필터링**: 자산 목록 조회 시 서버사이드 페이지네이션(페이지당 20건), 검색/카테고리 필터, 컬럼(자산명·구매일·구매가·상태) 클릭 정렬을 지원하여 대량 데이터에서도 원하는 자산을 빠르게 찾을 수 있습니다.
- **카테고리별 자산번호 체계**: 자산번호는 `ASSET-001`처럼 무의미한 일련번호가 아니라, `IT-001`(IT 장비), `FUR-002`(가구)처럼 카테고리 접두사 + 순번으로 구성되어 있어 번호만 봐도 어떤 카테고리 장비인지 바로 알 수 있습니다.
- **엑셀 내보내기 / 자산 등록 및 유지보수 내역서·견적서 업로드 통합**: 현재 검색·필터·정렬 조건이 반영된 자산 목록을 엑셀로 내려받을 수 있고, 자산 관리 화면 하나에서 "신규 자산 일괄 등록"과 "기존 자산 유지보수 내역서(엑셀)/견적서(PDF) 업로드"를 같은 드롭존으로 처리합니다. 업로드된 엑셀의 컬럼 구성(자산번호+자산명/카테고리/구매일/구매가/내용연수(년) 전체 존재 여부)만 보고 서버가 두 종류를 자동으로 판별하므로, 사용자가 파일 종류에 맞는 버튼을 따로 찾아 누를 필요가 없습니다. 행 단위로 검증하여 실패한 행(중복/누락된 자산번호, 형식 오류 등)은 한국어 사유와 함께 행별 미리보기 표에 붉은색으로 표시되고, 나머지 정상 행만 반영됩니다. 적용해도 실제로 생성될 항목이 하나도 없는 파일(전부 중복이거나 전부 일치하는 자산이 없는 경우)은 "적용" 버튼 대신 안내 문구만 표시해 혼동을 줄였습니다. 등록된 자산은 다른 자산과 동일하게 취급되므로, 자산 등록 파일은 "적용 취소"를 지원하지 않고 개별 자산 삭제로만 되돌릴 수 있습니다. "예시 파일" 버튼으로 정상/중복/전체 불일치/오류 행 포함 등 각 상황별 샘플 엑셀을 바로 내려받아 동작을 확인해볼 수 있습니다.
- **자산 변경 이력 기록 (Audit Log)**: 자산 및 유지보수 이력의 생성(CREATE), 수정(UPDATE), 삭제(DELETE)가 발생하면, 어떤 필드가 어떻게 바뀌었는지(이전 값/이후 값)와 수정자, 일시 등의 변경 로그를 `asset_audit_log` 테이블에 자동으로 기록합니다. 자산 상세 페이지의 "변경 이력" 섹션에서 자산별로 확인할 수 있고, 관리자는 "감사 로그" 메뉴에서 시스템 전체의 변경 이력을 작업 유형 필터 및 자산명 검색으로 한 화면에서 조회·필터링할 수 있습니다.
- **유지보수 이력 관리**: 각 자산 상세 페이지에서 유지보수 이력 항목을 등록할 수 있을 뿐 아니라, 기존 이력을 수정하거나 삭제하는 기능을 추가하여 관리의 유연성을 높였습니다. 이력 목록도 서버사이드 페이지네이션을 적용해 이력이 많은 자산도 빠르게 조회됩니다.

### 2. 예산 관리, AI 예측/시뮬레이션 및 실시간 소진율 연동
- **예산 설정**: 연도 및 월별로 유지보수 예산을 배정, 수정, 삭제할 수 있는 예산 관리 화면을 제공하며, 여러 달의 예산을 한 번에 저장하는 일괄 저장 기능도 지원합니다.
- **실시간 소진율 대시보드 연동**: 대시보드의 "예산 소진율" 카드가 더 이상 가상 데모 값이 아닌, 해당 월에 배정된 실제 예산액 대비 실제 발생한 유지보수 비용 합계를 기준으로 계산되어 실시간 소진 비율을 차트로 시각화합니다. 소진율이 90%를 넘으면 대시보드에 별도의 경고 배지와 카드가 표시됩니다.
- **AI 차년도 예산 예측**: 과거 월별 유지보수 비용 추이와 카테고리별 내용연수 초과(노후) 자산 비율을 근거로, LLM이 다음 해 12개월치 예상 예산과 산정 근거를 서술합니다.
- **AI 예산 배분 시뮬레이터**: 총 예산액을 입력하면, 자산별 누적 수리비·고장 이력·노후도를 반영해 카테고리별 배분안과 배분 사유를 LLM이 제시합니다. 반올림 등으로 배분 합계가 입력한 총 예산을 초과하지 않도록 서버에서 비율대로 재조정(clamp)합니다.

### 3. AI 기반 유지보수 분석, 고장 패턴 시각화 및 작업 지시서
- **고장 유형 분포 시각화 개선**: 조각이 많아질 때 가독성이 떨어지던 파이 차트를 개선하여 상위 5개 주요 고장 유형은 가로 막대 차트로 제공하고, 전체 고장 유형 목록은 건수 및 비율 순으로 정렬된 깔끔한 표 형식으로 제공합니다. (단순 점검/정기점검용 "없음" 유형은 통계 분석에서 자동 제외)
- **차트 한글 포맷 및 툴팁 개선**: 고장 유형 분포 차트 호버 시 `발생 건수 : 3대`, 월별 비용 추이 차트 호버 시 세 자리 쉼표가 들어간 `유지보수 비용 : 300,000원` 형태의 직관적인 한글 단위 툴팁으로 포맷팅을 개선하여 시각적 완성도를 높였습니다.
- **년-월 범위 필터링**: 조회하고자 하는 시작월과 종료월(YYYY-MM) 범위를 입력하면, AI 서술 역시 통계 카드와 별개로 선택한 범위의 건수만 정확히 반영하여 분석합니다.
- **고장 유형 연계 상세 조회**: 고장 유형 차트나 표의 행을 클릭하면 해당 고장이 발생한 자산 목록을 모달 팝업으로 조회하며, 자산 클릭 시 화면을 이동하지 않고 모달 우측의 사이드 패널에서 자산 상세 정보 및 전체 유지보수 이력을 실시간으로 간편하게 확인할 수 있습니다.
- **AI 작업 지시서 자동 생성**: 유지보수 이력에서 작업 지시서 생성을 요청하면, 해당 자산·이력 내용을 근거로 LLM이 단계별 작업 절차, 필요 공구/자재, 안전 수칙, 예상 소요 시간을 담은 작업 지시서를 생성합니다. 한 번 생성된 지시서는 DB에 저장되어 다시 요청해도 새로 생성하지 않고 저장된 내용을 그대로 반환합니다.

### 4. 파일 업로드 자동 판별 및 문서/견적서 자동 인식
- **파일 종류 자동 판별**: 자산 관리 화면의 파일 업로드 드롭존은 자산 등록용 엑셀과 유지보수 내역서(엑셀)/견적서(PDF)를 같은 곳에서 받습니다. 엑셀/CSV는 컬럼 구성만 보고(자산 등록에만 있는 자산명·카테고리·구매일·구매가·내용연수(년) 필수 컬럼 존재 여부) 서버가 자동으로 종류를 나누고, PDF는 항상 견적서/영수증으로 처리합니다.
- **PDF 견적서/영수증 자동 파싱**: PDF 견적서를 업로드하면 텍스트를 추출한 후 정규식 기반으로 **자산번호, 업체명, 견적일자, 총금액** 등의 주요 메타데이터를 자동 인식합니다.
- **일괄 업로드/일괄 적용**: 여러 개의 엑셀/견적서 파일을 한 번에 업로드하고, 분석이 끝난 항목들을 모아서 한 번에 적용할 수 있습니다. 실제로 적용해도 생성될 항목이 없는 파일(전부 중복/전부 불일치)은 일괄 적용 대상에서 자동으로 제외됩니다.
- **유지보수 기록/신규 자산 즉시 적용 및 적용 취소**: 분석 완료된 내용에서 "적용" 버튼을 누르면 유지보수 내역서는 유지보수 이력으로, 자산 등록 엑셀은 신규 자산으로 실제 반영됩니다. 유지보수 내역서/견적서는 잘못 적용한 경우 "적용 취소"로 되돌릴 수 있지만, 자산 등록은 등록된 자산이 이후 다른 데이터(유지보수 이력 등)와 얽힐 수 있어 "적용 취소"를 지원하지 않고 자산 목록에서의 개별 삭제로만 되돌립니다.
- **예시 파일 다운로드**: 자산 관리 화면 상단 "예시 파일" 버튼으로 자산 등록/유지보수 내역서(정상+불일치 혼합/전체 불일치/오류 행 포함) 샘플 엑셀을 즉시 내려받아, 각 업로드 시나리오가 화면에 어떻게 보이는지 바로 확인해볼 수 있습니다 (`frontend/public/templates/`).

### 5. 자연어 검색 (Natural Language Search)
- "5년 이상 사용한 노트북 보여줘", "A동에 있는 IT 장비 중 교체 필요한 것", "100만원 이하인 IT 장비" 등의 한국어 자연어 질문을 입력하면, LLM이 이를 카테고리/위치/사용기간/상태/가격(`minPrice`/`maxPrice`) 필터 조건으로 파싱하여 검색합니다.
- **고장/정비 이력 검색 추가**: "전원고장이 1번이라도 있었던 장비", "하드디스크 수리 이력이 있는 노트북", "고장난 적 없는 IT 장비" 등 긍정/부정 조건이 섞인 질문도 고장 키워드(`failureKeyword`), 최소 발생 횟수(`minFailureCount`), 부재(없음) 조건까지 정확히 파싱하여, 자산의 유지보수 기록(`maintenance_record`) 및 조치 내용까지 추적 및 매칭하여 검색 결과를 제공합니다.
- **가격 조건은 LLM이 아니라 서버가 확정 계산**: "~원 이상/이하" 같은 가격·카테고리 조건은 LLM이 숫자·문자열로만 추출하고, 실제 비교·필터링은 항상 서버 코드가 수행합니다. LLM이 조건에 안 맞는 자산을 후보로 잘못 골라도 최종 결과는 항상 정확하도록 설계되어 있습니다.

### 6. AI 교체 우선순위 추천
- 사용기간(내용연수 대비), 누적 수리 비용(구매가 대비 수리 비율), 고장 발생 빈도를 종합적으로 점수화하여 교체 대상 순위를 추천합니다.
- 가용 예산을 입력하면 예산 한도 내에서 가장 시급히 교체해야 할 최적의 자산 조합을 선별하고, 추천 사유를 LLM이 한국어로 요약 서술해 줍니다.
- **추천 사유 캐싱**: 추천 사유 텍스트의 근거가 되는 수치(사용기간·수리비율·고장횟수·점수)를 해시로 저장해두고, 페이지를 다시 열어도 근거 수치가 지난번과 동일하면 AI를 다시 호출하지 않고 저장된 문구를 그대로 재사용합니다. 추천된 자산 중 하나라도 근거 수치가 바뀌면(새 유지보수 이력 등) 전체 배치를 다시 생성해, "총평"이 일부만 갱신되어 앞뒤가 안 맞는 상황을 방지합니다.

### 7. AI 조달 규격서 자동 생성
- 교체가 필요한 자산에 대해, LLM이 실제 조달 실무에서 쓰이는 형식의 기술 규격 사양서와 제안요청서(RFP) 초안, 예상 조달 예산 및 산정 근거를 생성합니다.
- **실제 PDF 다운로드**: 브라우저 인쇄(`window.print()`)가 아니라, 화면에 생성된 규격서/RFP 내용을 그대로 서버(reportlab)에서 진짜 PDF 파일로 만들어 다운로드합니다. AI를 다시 호출하지 않으므로 화면에서 본 내용과 다운로드한 PDF 내용이 항상 일치합니다.

### 8. AI 고장 진단 챗봇
- 자산의 증상을 대화형으로 입력하면, 해당 자산의 과거 유지보수 이력을 참고하여 LLM이 예상 원인, 점검 순서, 필요 자재, 안전 수칙까지 단계별로 안내하는 진단 챗봇입니다.

### 9. AI 질의응답 (Q&A)
- 자연어 질문에 대해, DB 내 자산 및 유지보수 현황을 컨텍스트로 생성하여 LLM이 명확한 근거 자산 목록과 함께 서술 답변을 제공하는 채팅형 Q&A UI를 탑재하고 있습니다. 대화 내용은 계정별로 저장되어 탭을 이동하거나 새로고침해도 이어서 볼 수 있습니다.
- 자연어 검색과 마찬가지로, 질문에 가격·카테고리 조건이 섞여 있으면 LLM은 조건만 추출하고 실제 필터링은 서버가 확정적으로 재계산합니다.

### 10. AI 보고서 자동 생성
- 당월의 전체 자산 현황, 카테고리별/월별 유지보수 비용, 반복 고장 자산 상세 목록, 교체 추천 내역을 종합 취합하고, LLM이 총평·주요 문제점·향후 관리 권장사항을 각각 최소 3개 이상 구체적 근거(자산명·금액·비율)와 함께 서술합니다. 한글 CID 폰트 세팅이 내장되어 있어 깨짐 없이 깨끗한 PDF 파일로 즉시 다운로드할 수 있습니다.
- **AI 서술만 별도 갱신**: 미리보기 화면을 먼저 보여준 뒤 "AI 요약 보기"를 누르면 서술을 생성하는데, 이때 화면에 이미 계산되어 있는 통계를 그대로 서버에 전달해 DB를 다시 조회하지 않고 AI 서술만 추가로 생성합니다.

### 11. 보안, 안정성 및 UI/UX 편의성 강화
- **무차별 대입(Brute-force) 공격 차단**: 연속 5회 로그인 실패 시 해당 요청 IP를 10분간 즉시 차단하여 비인가자의 불법 무단 접속을 강력히 방어합니다. nginx 리버스 프록시 뒤에서도 `X-Real-IP` 헤더로 실제 클라이언트 IP를 판별하므로, 모든 사용자가 프록시의 주소 하나로 뭉뚱그려져 한 사람의 실수로 전체가 잠기는 일이 없습니다.
- **역할 기반 권한(RBAC)**: 자산·예산·유지보수 이력·파일 업로드의 쓰기 작업은 관리자(`ADMIN`)만 가능하고, 일반 사용자(`USER`)는 조회만 가능합니다.
- **AI 엔드포인트 요청 제한 (Rate Limiting)**: gn-cab API 키 자체의 분당 호출 제한을 넘지 않도록, AI/자연어검색/보고서 엔드포인트에는 서버단에서 분당 호출 횟수를 제한합니다. 전체 공유 상한(15회/분)과 별개로 IP별 개별 상한(8회/분)도 함께 적용되어, 특정 사용자 한 명이 공유 한도를 독점해 다른 사용자의 AI 기능을 막는 것을 방지합니다.
- **업로드 파일 경로 조작 방지**: 업로드된 파일의 원본 파일명에 `../` 같은 경로 조작 문자열이 섞여 있어도, 디렉터리 구성요소를 제거하고 UUID를 붙인 안전한 파일명으로만 디스크에 저장하여 지정된 업로드 폴더 밖으로 파일이 쓰이는 것을 방지합니다.
- **JWT 기본 시크릿 사용 차단**: 저장소에 공개된 기본 개발용 `JWT_SECRET` 값을 그대로 두면(운영 환경 여부와 무관하게) 서버가 아예 기동을 거부합니다. 과거에는 이 검증이 데모 모드 여부에 따라 건너뛰어질 수 있어, 실수로 데모 설정이 켜진 채 배포되면 토큰 위조가 가능한 상태로 서비스될 위험이 있었습니다.
- **넘침 방지 네비게이션 스크롤**: 메뉴가 늘어나 화면 너비를 초과하는 경우, 넘침을 감지하여 나타나는 좌우 화살표 버튼으로 메뉴를 스크롤할 수 있도록 UX를 최적화했습니다.
- **반응형 웹 UI 완벽 지원**: 태블릿 및 모바일 디바이스 뷰포트에서도 깨짐이 없도록 검색바/필터 레이아웃을 Wrap 처리하고 통계 그리드, 모달 여백 등을 유동적으로 조정했습니다.
- **`.env` 파일 보호**: API 키·DB 비밀번호가 담긴 `backend-py/.env`는 `.gitignore`로 git 추적에서 제외되어 있어 GitHub에는 절대 올라가지 않습니다. 배포 서버에서도 파일 권한을 `600`(소유자만 읽기/쓰기)으로 제한해, 서버 내 다른 서비스 계정(nginx, MySQL 등)이 실수로라도 내용을 읽지 못하도록 안전장치를 추가했습니다.
- **전용 비루트(non-root) 서비스 계정**: 백엔드 프로세스는 더 이상 root로 실행되지 않고, 이 서비스만을 위한 전용 시스템 계정(`asset-backend`, 로그인 셸 없음)으로 구동됩니다. 코드/설정 파일에는 ACL로 필요한 범위만 읽기 권한을 부여했습니다. 애플리케이션에 원격 코드실행급 취약점이 있더라도, 곧바로 서버 전체 권한(root)으로 이어지지 않도록 피해 범위를 최소화한 것입니다.
- **DB 계정 최소 권한**: 애플리케이션이 사용하는 DB 계정에는 `GRANT ALL`을 주지 않고, 실제로 필요한 `SELECT/INSERT/UPDATE/DELETE`(CRUD)와 `CREATE/ALTER/INDEX/REFERENCES`(최초 기동 시 테이블 자동 생성용)만 부여합니다. DB 접속정보가 유출되더라도 다른 스키마를 건드리거나 데이터베이스 자체를 삭제하는 등의 관리자급 작업은 할 수 없습니다.
- **운영 안정성**: 배포 서버는 uvicorn 단일 워커로 동작합니다(LLM 응답 캐시 등 프로세스 메모리 기반 상태가 워커별로 나뉘지 않도록 하기 위함이며, 2인용 내부 도구 규모에서는 스레드풀만으로 동시 요청 처리에 충분합니다). 메모리가 넉넉하지 않은 서버라 systemd `MemoryHigh`/`MemoryMax`로 안전장치를 걸어뒀고, 매일 새벽 DB를 자동 백업(14일 보관)하며, LLM 호출 실패는 조용히 무시되지 않고 서버 로그에 스택트레이스까지 기록됩니다. GitHub Actions로 `backend-py` 변경 시마다 pytest가 자동 실행되어 회귀를 방지하고, 배포는 저장소 루트의 `deploy.sh`로 git pull → 변경분 재시작/재빌드 → 배포 후 검증까지 한 번에 처리합니다.

---

## 프로젝트 구조

```
Assistant-Project/
├── backend-py/              # FastAPI 백엔드
│   ├── app/
│   │   ├── routers/         # REST API 라우터
│   │   │   ├── assets.py    # 자산 CRUD, 엑셀 내보내기/일괄 등록, 감사 로그
│   │   │   ├── budgets.py   # 예산 배정 CRUD
│   │   │   ├── ai.py        # 자연어 검색, 교체 추천, 유지보수 분석, 작업 지시서,
│   │   │   │                #   예산 예측/시뮬레이터, 조달 규격서, 고장 진단 챗봇
│   │   │   ├── qna.py       # AI Q&A
│   │   │   ├── reports.py   # 월간 보고서 (화면/PDF)
│   │   │   ├── chat.py      # AI 어시스턴트 대화 이력
│   │   │   ├── files.py     # 파일 업로드/파싱/적용
│   │   │   ├── dashboard.py # 대시보드 통계
│   │   │   └── auth_router.py # 로그인
│   │   ├── models.py        # SQLAlchemy 테이블 모델 (AssetAuditLog, Budget, WorkOrder 등)
│   │   ├── schemas.py       # Pydantic 데이터 검증 스키마
│   │   ├── auth.py          # JWT 토큰 처리, 로그인 실패 IP 잠금, require_admin 의존성
│   │   ├── rate_limit.py    # AI 엔드포인트 요청 제한(Rate Limiting)
│   │   ├── scoring.py       # 교체 우선순위 점수 계산 공용 로직
│   │   ├── config.py        # 환경변수 로딩 및 설정
│   │   ├── database.py      # 데이터베이스 커넥션/세션 풀 설정
│   │   ├── llm.py           # 사내 Qwen3.5(gn-cab) LLM 연동 클라이언트
│   │   ├── qna_logic.py     # AI Q&A 지식 베이스 검색/컨텍스트 로직
│   │   └── main.py          # 애플리케이션 진입점 (FastAPI 인스턴스 기동 및 미들웨어 설정)
│   ├── tests/                # pytest 자동화 테스트
│   ├── requirements.txt     # Python 라이브러리 의존성 파일
│   └── README.md            # 백엔드 전용 README
├── frontend/                 # React 프론트엔드
│   ├── public/
│   │   └── templates/       # 자산 등록/유지보수 내역서 예시 엑셀 (자산 관리 화면 "예시 파일" 다운로드)
│   ├── src/
│   │   ├── components/      # 네비게이션 레이아웃, 공용 Badge 등 공통 컴포넌트
│   │   ├── context/         # AuthContext (인증 및 전역 로그인 상태 관리)
│   │   ├── pages/           # 개별 화면 (대시보드, 자산 관리(파일 업로드 포함)/상세,
│   │   │                    #   예산 관리, 감사 로그 등. React.lazy로 코드 스플리팅)
│   │   ├── services/        # Axios 기반 API 연동 모듈 (api.js)
│   │   ├── App.jsx          # 프론트엔드 라우팅 및 렌더링 루트
│   │   └── index.css        # 스타일 시트 (네비게이션 화살표 스타일 추가)
│   └── package.json         # 프론트엔드 패키지 의존성 파일
├── .github/workflows/        # GitHub Actions CI (backend-py 변경 시 pytest, frontend 변경 시 vitest 자동 실행)
└── docs/                     # 데이터베이스 테이블 및 초기 데이터 스크립트 (schema.sql)
```

---

## 실행 방법

### 1. 백엔드 실행

```bash
cd backend-py
python -m venv venv          # 가상환경 생성
source venv/bin/activate     # 가상환경 활성화 (Windows: venv\Scripts\activate)
pip install -r requirements.txt
cp .env.example .env         # 환경설정 파일 복사 (DATABASE_URL, API KEY 설정)
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

백엔드 서버는 `http://localhost:8080` 에서 구동됩니다. 최초 기동 시 테이블을 자동으로 생성하고 기본 관리자 계정(`admin`/`admin123`) 및 일반 사용자 계정(`user`/`user123`)을 시딩합니다.
*자세한 백엔드 설정 사항은 `backend-py/README.md`를 참고하세요.*

#### 데모 데이터 적재 (선택)
MySQL 클라이언트로 초기 자산 및 유지보수 샘플 데이터를 직접 입력할 경우, 한글 인코딩 깨짐을 방지하기 위해 반드시 `utf8mb4` 문자셋을 지정해서 가져오기를 실행합니다.

```bash
mysql --default-character-set=utf8mb4 -u asset -p asset_management < docs/schema.sql
```

### 2. 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

프론트엔드 개발 서버는 `http://localhost:5173` 에서 실행됩니다.

---

## 데모 계정
- **관리자 계정**: admin / admin123 — 자산/예산/유지보수 이력/파일업로드 등록·수정·삭제 등 모든 기능 사용 가능
- **일반 계정**: user / user123 — 조회 전용. 등록/수정/삭제 등 쓰기 작업은 서버에서 403으로 차단되며, 프론트엔드에서도 관련 버튼이 노출되지 않음

---

## 역할 기반 권한(RBAC)
`app_user.role`이 `ADMIN`/`USER` 두 등급으로 나뉘며, 자산·예산·유지보수 이력·파일 업로드의 생성/수정/삭제 엔드포인트는 `require_admin` 의존성으로 보호됩니다. `USER` 역할은 조회(GET) 엔드포인트만 호출할 수 있고, 쓰기 요청은 403 Forbidden으로 거부됩니다.

---

## 테스트

```bash
cd backend-py
pytest
```

pytest + FastAPI TestClient + SQLite 인메모리 DB 기반으로 인증, 자산 CRUD, 엑셀 일괄 등록, 감사 로그(검색 포함), 파일 업로드, 권한 분리, AI 게이팅, AI 요청 제한, 챗봇 이력 저장, 사용기간 계산 정확도, 예산 배분 반올림 불변식(합계가 예산을 넘지 않는지) 등을 검증하는 자동화 테스트가 `backend-py/tests/`에 있습니다. 각 테스트는 트랜잭션 롤백으로 격리되어 서로 영향을 주지 않으며, GitHub Actions로 `backend-py` 변경 시마다 자동 실행됩니다.

```bash
cd frontend
npm test
```

Vitest + React Testing Library 기반으로 공용 유틸/컨텍스트/컴포넌트 및 주요 페이지 동작을 검증하는 프론트엔드 테스트가 `frontend/src/**/*.test.{js,jsx}`에 있습니다. 백엔드와 마찬가지로 GitHub Actions로 `frontend` 변경 시마다 자동 실행됩니다.

---

## API 엔드포인트

### 인증 (Auth)
- `POST /api/auth/login` - 사용자 로그인 (IP 잠금 적용)

### 자산 관리 (Assets)
- `GET /api/assets` - 자산 목록 조회 (서버사이드 페이지네이션, 검색어, 카테고리 필터, 컬럼 정렬 매개변수 지원)
- `GET /api/assets/export` - 현재 검색/필터/정렬 조건이 반영된 자산 목록 엑셀 다운로드
- `GET /api/assets/audit-logs` - 시스템 전체 변경 이력(감사 로그) 조회, 작업 유형/작업자/자산명 검색 필터 지원 (관리자 전용)
- `POST /api/assets/import` - 엑셀 파일로 자산 일괄 등록 (행 단위 검증, 실패 행은 사유와 함께 건너뜀, 관리자 전용. 프론트엔드는 아래 `/api/files/*`의 자동 판별 업로드 드롭존을 통해 이 로직을 재사용함)
- `GET /api/assets/{id}` - 자산 상세 조회
- `POST /api/assets` - 자산 신규 등록 (변경 이력 기록, 관리자 전용)
- `PUT /api/assets/{id}` - 자산 정보 수정 (변경 이력 기록, 관리자 전용)
- `DELETE /api/assets/{id}` - 자산 삭제 (변경 이력 기록, 관리자 전용)
- `GET /api/assets/{id}/history` - 자산별 변경 이력(Audit Log) 목록 조회
- `GET /api/assets/{id}/maintenance` - 자산별 유지보수 이력 목록 조회 (페이지네이션)
- `POST /api/assets/{id}/maintenance` - 유지보수 이력 등록
- `PUT /api/assets/{id}/maintenance/{record_id}` - 유지보수 이력 수정
- `DELETE /api/assets/{id}/maintenance/{record_id}` - 유지보수 이력 삭제

### 예산 관리 (Budgets)
- `GET /api/budgets` - 전체 연월 예산 배정 목록 조회
- `PUT /api/budgets/{year}/{month}` - 특정 연월 예산 설정 및 수정
- `DELETE /api/budgets/{year}/{month}` - 특정 연월 예산 삭제

### AI 및 대시보드 분석 (AI)
- `POST /api/ai/natural-language-search` - 자연어 검색 (LLM은 카테고리/가격/사용기간 등 조건만 파싱, 실제 매칭은 서버가 확정 계산)
- `POST /api/ai/replacement-recommendation` - 교체 우선순위 추천 (예산 제약 조건 대응)
- `GET /api/ai/maintenance-analysis` - 유지보수 비용/고장 유형 AI 종합 분석 (기간 범위 필터 지원)
- `GET /api/ai/maintenance-analysis/failure-assets` - 특정 고장 유형이 발생한 자산 목록 및 발생 빈도 조회
- `GET /api/ai/work-orders/{maintenance_record_id}` - 유지보수 이력 기반 AI 작업 지시서 생성/조회 (최초 1회 생성 후 재사용)
- `GET /api/ai/budgets/forecast` - 과거 추이 및 노후 자산 비율 기반 차년도 12개월 예산 예측
- `POST /api/ai/budgets/simulate` - 총 예산 입력 시 카테고리별 AI 배분 시뮬레이션 (배분 합계는 입력 예산을 넘지 않도록 자동 보정)
- `GET /api/ai/procurement-spec/{asset_id}` - 자산 기반 AI 조달 규격서(기술 규격서 + RFP + 예산안) 생성
- `POST /api/ai/procurement-spec/{asset_id}/pdf` - 생성된 조달 규격서를 실제 PDF 파일로 다운로드 (AI 재호출 없음)
- `POST /api/ai/diagnose` - 자산 유지보수 이력 기반 AI 고장 진단 챗봇
- `POST /api/qa/ask` - 자산/유지보수 데이터 컨텍스트 기반 AI 챗봇 질의응답 (대화 내용은 계정별로 저장되어 탭 이동 후에도 유지)
- `GET /api/chat/history` / `DELETE /api/chat/history` - AI 챗봇 대화 이력 조회 및 초기화
- `GET /api/reports/monthly` - 월간 종합 분석 보고서 데이터 조회 (`includeAi=true`로 AI 서술 포함 여부 선택)
- `POST /api/reports/monthly/narrative` - 이미 조회된 보고서 통계 데이터를 받아 AI 서술(총평/문제점/권장사항)만 생성 (DB 재조회 없음)
- `GET /api/reports/monthly/pdf` - 월간 보고서 PDF 다운로드 (한글 폰트 내장)
- `GET /api/dashboard` - 대시보드 통계 및 실시간 예산 대비 소진율 현황 조회

> AI를 실제로 호출하는 위 엔드포인트들(`/api/ai/*`, `/api/qa/*`, `/api/reports/*`)은 gn-cab API 키의 분당 호출 제한을 넘지 않도록 서버단에서 분당 요청 횟수가 제한되어 있으며, 초과 시 `429 Too Many Requests`를 반환합니다.

### 파일 업로드 및 가공 (Files)
- `GET /api/files` - 업로드된 파일 정보 목록 조회
- `POST /api/files/upload` - 자산 등록용 엑셀 / 유지보수 내역서(엑셀·CSV) / 견적서(PDF) 파일 업로드 (종류는 이후 분석 단계에서 자동 판별)
- `POST /api/files/batch-upload` - 여러 파일 한 번에 업로드
- `POST /api/files/{id}/process` - 엑셀/CSV는 컬럼 구성을 보고 자산 등록용인지 유지보수 내역용인지 자동 판별 후 행 단위 검증, PDF 견적서는 핵심 정보(자산번호, 금액 등) 자동 파싱 분석
- `POST /api/files/{id}/apply` - 분석된 내용을 실제 데이터로 적용 (유지보수 내역서·견적서는 유지보수 기록으로, 자산 등록 엑셀은 신규 자산으로 생성)
- `POST /api/files/batch-apply` - 여러 파일을 한 번에 적용 (실제로 적용할 항목이 없는 파일은 자동 제외)
- `POST /api/files/{id}/unapply` - 적용된 유지보수 기록 적용 취소(되돌리기). 자산 등록 파일은 지원하지 않음(400 반환)
- `DELETE /api/files/{id}` - 업로드된 파일 삭제

---

## 환경 변수 설정 (`backend-py/.env`)

```env
DATABASE_URL=mysql+pymysql://asset:assetpass@127.0.0.1:3306/asset_management?charset=utf8mb4
JWT_SECRET=CHANGE_ME_to_a_unique_random_secret
JWT_EXPIRATION_SECONDS=86400
UPLOAD_DIRECTORY=./uploads
DEMO_MODE=true
# 사내 GPU 서버(gn-cab) API Key (AI 기능 실구동 시 필수 입력)
GN_API_KEY=
GN_MODEL=qwen35   # 간단한 응답용. 심층 분석이 필요한 일부 기능은 내부적으로 qwen35-think를 사용
```

> **보안 안전장치**: `.env`는 `.gitignore`에 등록되어 git에 커밋되지 않습니다 (`git add -A`를 써도 자동으로 제외됨). 배포 서버에서는 파일 권한을 `chmod 600`으로 설정해 소유자(root) 외에는 읽을 수 없도록 제한하는 것을 권장합니다. `JWT_SECRET`을 예시 기본값 그대로 두면(공개 저장소에 노출된 값이라 토큰 위조가 가능해짐) `DEMO_MODE` 설정과 무관하게 서버가 기동을 아예 거부합니다.

---

## 데이터베이스 스키마

### 1. 사용자 (`app_user` / `user`)
권한 및 시스템 로그인을 관리합니다.
- `id`: BIGINT (PK, Auto Increment)
- `username`: VARCHAR(50) (NOT NULL, UNIQUE) - 로그인 아이디
- `password`: VARCHAR(255) (NOT NULL) - 암호화된 비밀번호
- `role`: ENUM('ADMIN', 'USER') (NOT NULL) - 권한 등급
- `email`: VARCHAR(100) - 이메일 주소
- `created_at`: TIMESTAMP - 등록 일시

### 2. 자산 (`asset`)
관리 대상인 공공시설 자산의 상세 명세를 저장합니다.
- `id`: BIGINT (PK, Auto Increment)
- `asset_name`: VARCHAR(200) (NOT NULL) - 자산 명칭
- `asset_code`: VARCHAR(50) (NOT NULL, UNIQUE) - 식별 코드, 카테고리 접두사 + 순번 (예: `IT-001`, `FUR-002`)
- `category`: VARCHAR(100) (NOT NULL) - 분류 카테고리 (IT 장비, 설비 등)
- `location`: VARCHAR(200) - 설치 위치
- `responsible_person`: VARCHAR(100) - 담당 관리자
- `purchase_date`: DATE (NOT NULL) - 구매/취득 일자
- `purchase_price`: DECIMAL(15, 2) (NOT NULL) - 구매 금액
- `useful_life`: INT (NOT NULL) - 내용연수 (년 단위 기대 수명)
- `status`: ENUM('ACTIVE', 'INACTIVE', 'REPLACEMENT_NEEDED', 'UNDER_MAINTENANCE') (NOT NULL) - 자산 상태
- `description`: TEXT - 상세 메모/설명
- `created_at`: TIMESTAMP - 데이터 생성 일시
- `updated_at`: TIMESTAMP - 데이터 최종 수정 일시

### 3. 유지보수 이력 (`maintenance_record`)
자산별 수리, 교체, 정기 점검 등의 이력을 저장합니다.
- `id`: BIGINT (PK, Auto Increment)
- `asset_id`: BIGINT (FK -> `asset.id` ON DELETE CASCADE) - 대상 자산 ID
- `maintenance_date`: DATE (NOT NULL) - 유지보수 수행일
- `maintenance_type`: ENUM('ROUTINE', 'REPAIR', 'REPLACEMENT', 'INSPECTION') (NOT NULL) - 작업 종류
- `cost`: DECIMAL(15, 2) - 발생 비용 (비용 미기재 이력 허용)
- `description`: TEXT - 조치 내용 설명
- `technician`: VARCHAR(100) - 작업 정비사/업체명
- `failure_type`: VARCHAR(200) - 고장 유형 분류 (예: 전원 고장, 인버터 소손 등)
- `created_at`: TIMESTAMP - 등록 일시

### 4. 파일 업로드 (`file_upload`)
엑셀, CSV, PDF 등의 데이터 파일 업로드 상태와 분석 데이터를 기록합니다.
- `id`: BIGINT (PK, Auto Increment)
- `filename`: VARCHAR(255) (NOT NULL) - 저장된 난수화 파일명
- `original_filename`: VARCHAR(255) (NOT NULL) - 업로드 당시 원본 파일명
- `file_type`: ENUM('EXCEL', 'CSV', 'PDF') (NOT NULL) - 파일 확장자 형식
- `file_path`: VARCHAR(500) (NOT NULL) - 디스크 내 물리적 저장 경로
- `status`: ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') (NOT NULL) - 분석 처리 상태
- `extracted_data`: JSON / TEXT - 판별된 종류(자산 등록/유지보수 내역/견적서)와 텍스트 추출·파싱 데이터 (자산번호, 금액 등)
- `error_message`: TEXT - 분석 실패 시 오류 원인 로그
- `applied`: BOOLEAN (DEFAULT FALSE) - 데이터베이스(유지보수 기록 등)에 실제 적용 완료 여부
- `created_at`: TIMESTAMP - 업로드 일시
- `updated_at`: TIMESTAMP - 상태 갱신 일시

### 5. 자산 변경 이력 (`asset_audit_log`)
자산의 등록, 수정, 삭제 시 변경된 이전 값과 이후 값의 스냅샷을 기록합니다.
- `id`: BIGINT (PK, Auto Increment)
- `asset_id`: BIGINT (index) - 변경 대상 자산 ID (자산 삭제 후 보존을 위해 외래키 해제)
- `asset_code`: VARCHAR(50) - 자산 식별 코드
- `action`: ENUM('CREATE', 'UPDATE', 'DELETE') (NOT NULL) - 작업 종류
- `changed_by`: VARCHAR(50) - 변경을 수행한 로그인 유저명
- `changes`: TEXT - 변경된 필드들의 변경 전/후 값 스냅샷 (JSON 형식 문자열)
- `created_at`: TIMESTAMP - 로그 기록 일시

### 6. 예산 (`budget`)
월별 유지보수 예산 배정 현황을 관리합니다.
- `id`: BIGINT (PK, Auto Increment)
- `year`: INT (NOT NULL) - 배정 연도
- `month`: INT (NOT NULL) - 배정 월
- `allocated_amount`: DECIMAL(15, 2) (NOT NULL) - 배정 예산 금액
- `created_at`: TIMESTAMP - 등록 일시
- `updated_at`: TIMESTAMP - 최종 수정 일시
- *유니크 제약조건*: `(year, month)` 중복 설정 방지

### 7. AI 대화 이력 (`chat_message`)
AI 어시스턴트와의 계정별 대화 기록을 관리합니다.
- `id`: BIGINT (PK, Auto Increment)
- `user_id`: BIGINT (FK -> `app_user.id` ON DELETE CASCADE) - 대상 사용자 ID
- `role`: ENUM('USER', 'AI') (NOT NULL) - 메시지 작성자 역할
- `content`: TEXT (NOT NULL) - 대화 질문 및 답변 본문 내용
- `assets`: TEXT - 답변 시 연계된 추천/필터링 대상 자산 목록 (JSON 형식 문자열)
- `has_filter`: BOOLEAN (DEFAULT FALSE) - 답변 내에 자산 필터링이 포함되었는지 여부
- `created_at`: TIMESTAMP - 대화 기록 일시

### 8. AI 작업 지시서 (`work_order`)
유지보수 이력별로 생성된 AI 작업 지시서를 저장하여, 같은 이력을 다시 조회할 때 재생성 없이 그대로 반환합니다.
- `id`: BIGINT (PK, Auto Increment)
- `maintenance_record_id`: BIGINT (FK -> `maintenance_record.id` ON DELETE CASCADE, UNIQUE) - 대상 유지보수 이력 ID
- `title`: VARCHAR(255) (NOT NULL) - 작업 지시서 제목
- `steps`: TEXT (NOT NULL) - 단계별 작업 절차 (JSON 배열 문자열)
- `required_tools`: TEXT - 필요 공구/자재 목록 (JSON 배열 문자열)
- `safety_precautions`: TEXT - 안전 수칙 목록 (JSON 배열 문자열)
- `estimated_time`: VARCHAR(100) - 예상 소요 시간
- `created_at`: TIMESTAMP - 생성 일시

### 9. AI 교체 추천 사유 캐시 (`asset_replacement_reason`)
교체 우선순위 추천 사유(AI 생성 텍스트)를 캐싱하여, 근거 수치가 안 바뀌었으면 AI를 다시 호출하지 않습니다.
- `asset_id`: BIGINT (PK, FK -> `asset.id` ON DELETE CASCADE) - 대상 자산 ID
- `metrics_hash`: VARCHAR(64) (NOT NULL) - 사용기간/수리비율/고장횟수/점수 등 근거 수치의 해시
- `reason`: TEXT (NOT NULL) - AI가 생성한 추천 사유 문구
- `updated_at`: TIMESTAMP - 최종 갱신 일시

---

## 주요 라이브러리 및 기술 스택

### 백엔드 (Backend)
- **FastAPI**: 초고속 비동기 REST API 프레임워크
- **SQLAlchemy**: 강력한 Python SQL 툴킷 및 ORM
- **PyMySQL / cryptography**: MySQL 연결 드라이버 및 보안 모듈
- **python-jose / passlib[bcrypt]**: JWT 인증 및 암호 해싱 처리
- **openai**: OpenAI 및 호환 API(사내 Qwen3.5 등) 연동 클라이언트
- **reportlab**: PDF 생성 라이브러리 (한글 폰트 렌더링 대응)
- **pdfplumber**: PDF 파일의 정밀 텍스트 및 테이블 추출 도구
- **pandas / openpyxl**: Excel/CSV 파일 분석 및 데이터 가공

### 프론트엔드 (Frontend)
- **React 19**: 컴포넌트 기반 웹 UI 라이브러리
- **Vite**: 초고속 프론트엔드 빌드 툴
- **Tailwind CSS**: 유틸리티 우선의 CSS 스타일링 프레임워크
- **Axios**: HTTP 비동기 통신 클라이언트
- **React Router Dom**: SPA 라우팅 네비게이션
- **Recharts**: 반응형 데이터 시각화 차트 라이브러리
- **Lucide React**: 깔끔한 SVG 아이콘 패키지
