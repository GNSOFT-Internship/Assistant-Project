# 공공시설 유지보수 및 자산관리 AI 시스템

본 시스템은 공공시설의 자산 등록/조회/수정/삭제 등의 기본 관리 기능부터, 월별 유지보수 예산 수립, AI 기반의 자연어 검색 및 유지보수 분석, 교체 대상 자산 추천, PDF 견적서 자동 인식 및 자동 등록, AI Q&A 및 월간 보고서 생성 등의 지능형 기능을 제공하는 종합 자산 관리 플랫폼입니다.

## 아키텍처
- **Backend**: FastAPI (Python), SQLAlchemy, REST API, Anthropic Claude API (LLM)
- **Frontend**: React (Vite, Tailwind CSS)
- **DB**: MySQL / MariaDB

백엔드는 Python 단일 서비스로 통일되어 있으며, 자연어 검색 · 교체 우선순위 추천 · 유지보수 분석 · 보고서 서술 · Q&A는 모두 Claude API (`claude-3-5-sonnet` / `claude-opus-4-8` 등)를 호출하여 작동합니다. `ANTHROPIC_API_KEY`가 설정되지 않은 경우, 각 기능은 규칙 기반 폴백(Fallback)으로 동작하여 개발 및 데모 환경에서 키 없이도 시스템 기동 및 기본 시뮬레이션이 가능합니다.

---

## 주요 기능

### 1. 자산 관리 & 변경 이력 추적
- **자산 CRUD**: 자산 등록/수정/삭제/조회 기능 제공.
- **서버사이드 페이지네이션 & 필터링**: 자산 목록 조회 시 서버사이드 페이지네이션(페이지당 20건)과 서버사이드 검색/카테고리 필터를 적용하여 대량 데이터 노출 시 성능을 최적화하고 속도를 개선했습니다.
- **자산 변경 이력 기록 (Audit Log)**: 자산의 생성(CREATE), 수정(UPDATE), 삭제(DELETE)가 발생하면, 어떤 필드가 어떻게 바뀌었는지(이전 값/이후 값)와 수정자, 일시 등의 변경 로그를 `asset_audit_log` 테이블에 자동으로 기록하며 자산 상세 페이지 내 "변경 이력" 섹션에서 확인할 수 있습니다.
- **유지보수 이력 관리**: 각 자산 상세 페이지에서 유지보수 이력 항목을 등록할 수 있을 뿐 아니라, 기존 이력을 수정하거나 삭제하는 기능을 추가하여 관리의 유연성을 높였습니다.

### 2. 예산 관리 및 실시간 소진율 연동
- **예산 설정**: 연도 및 월별로 유지보수 예산을 배정, 수정, 삭제할 수 있는 예산 관리 화면을 제공합니다.
- **실시간 소진율 대시보드 연동**: 대시보드의 "예산 소진율" 카드가 더 이상 가상 데모 값이 아닌, 해당 월에 배정된 실제 예산액 대비 실제 발생한 유지보수 비용 합계를 기준으로 계산되어 실시간 소진 비율을 차트로 시각화합니다.

### 3. AI 기반 유지보수 분석 및 고장 패턴 시각화
- **고장 유형 분포 시각화 개선**: 조각이 많아질 때 가독성이 떨어지던 파이 차트를 개선하여 상위 5개 주요 고장 유형은 가로 막대 차트로 제공하고, 전체 고장 유형 목록은 건수 및 비율 순으로 정렬된 깔끔한 표 형식으로 제공합니다. (단순 점검/정기점검용 "없음" 유형은 통계 분석에서 자동 제외)
- **년-월 범위 필터링**: 조회하고자 하는 시작월과 종료월(YYYY-MM) 범위를 입력하여, 특정 기간에 발생한 고장 패턴 및 자산 분포만 정밀하게 필터링하여 조회할 수 있습니다.
- **고장 유형 연계 상세 조회**: 고장 유형 차트나 표의 행을 클릭하면 해당 고장이 발생한 자산 목록을 모달 팝업으로 조회하며, 자산 클릭 시 화면을 이동하지 않고 모달 우측의 사이드 패널에서 자산 상세 정보 및 전체 유지보수 이력을 실시간으로 간편하게 확인할 수 있습니다.

### 4. 파일 업로드 및 문서/견적서 자동 인식
- **PDF 견적서/영수증 자동 파싱**: 엑셀/CSV 데이터 임포트뿐만 아니라 PDF 견적서를 업로드하는 경우 텍스트를 추출한 후 정규식 기반으로 **자산코드, 업체명, 견적일자, 총금액** 등의 주요 메타데이터를 자동 인식합니다.
- **유지보수 기록 즉시 적용**: 분석 및 파싱 완료된 내용에서 "적용" 버튼을 누르면, 실제 해당 자산의 유지보수 이력 기록으로 자동 등록 및 데이터베이스에 적재됩니다.

### 5. 자연어 검색 (Natural Language Search)
- "5년 이상 사용한 노트북 보여줘", "A동에 있는 IT 장비 중 교체 필요한 것" 등의 한국어 자연어 질문을 입력하면, LLM이 이를 카테고리/위치/사용기간/상태 필터 조건으로 파싱한 후 DB를 검색하여 검색 결과와 함께 검색 조건 해석 내용(한국어 요약)을 제공합니다.

### 6. AI 교체 우선순위 추천
- 사용기간(내용연수 대비), 누적 수리 비용(구매가 대비 수리 비율), 고장 발생 빈도를 종합적으로 점수화하여 교체 대상 순위를 추천합니다.
- 가용 예산을 입력하면 예산 한도 내에서 가장 시급히 교체해야 할 최적의 자산 조합을 선별하고, 추천 사유를 LLM이 한국어로 요약 서술해 줍니다.

### 7. AI 질의응답 (Q&A)
- 자연어 질문에 대해, DB 내 자산 및 유지보수 현황을 컨텍스트로 생성하여 LLM이 명확한 근거 자산 목록과 함께 서술 답변을 제공하는 채팅형 Q&A UI를 탑재하고 있습니다.

### 8. AI 보고서 자동 생성
- 당월의 전체 자산 현황, 총 유지보수 비용 추이, 교체 추천 내역, 주요 문제점 및 향후 권장 사항 등을 종합 취합하여 LLM이 한 편의 정제된 서술형 보고서로 요약·생성합니다. 한글 CID 폰트 세팅이 내장되어 있어 깨짐 없이 깨끗한 PDF 파일로 즉시 다운로드할 수 있습니다.

### 9. 보안 및 UI/UX 편의성 강화
- **무차별 대입(Brute-force) 공격 차단**: 연속 5회 로그인 실패 시 해당 요청 IP를 10분간 즉시 차단하여 비인가자의 불법 무단 접속을 강력히 방어합니다.
- **넘침 방지 네비게이션 스크롤**: 메뉴가 늘어나 화면 너비를 초과하는 경우, 넘침을 감지하여 나타나는 좌우 화살표 버튼으로 메뉴를 스크롤할 수 있도록 UX를 최적화했습니다.
- **반응형 웹 UI 완벽 지원**: 태블릿 및 모바일 디바이스 뷰포트에서도 깨짐이 없도록 검색바/필터 레이아웃을 Wrap 처리하고 통계 그리드, 모달 여백 등을 유동적으로 조정했습니다.

---

## 프로젝트 구조

```
Assistant-Project/
├── backend-py/              # FastAPI 백엔드
│   ├── app/
│   │   ├── routers/         # REST API 라우터 (assets.py, budgets.py, ai.py, files.py 등)
│   │   ├── models.py        # SQLAlchemy 테이블 모델 (AuditLog, Budget 추가)
│   │   ├── schemas.py       # Pydantic 데이터 검증 스키마
│   │   ├── auth.py          # JWT 토큰 처리 및 로그인 실패 IP 잠금 로직
│   │   ├── config.py        # 환경변수 로딩 및 설정
│   │   ├── database.py      # 데이터베이스 커넥션/세션 풀 설정
│   │   ├── llm.py           # Anthropic Claude API 연동 클라이언트
│   │   ├── qna_logic.py     # AI Q&A 지식 베이스 검색/컨텍스트 로직
│   │   └── main.py          # 애플리케이션 진입점 (FastAPI 인스턴스 기동 및 미들웨어 설정)
│   ├── requirements.txt     # Python 라이브러리 의존성 파일
│   └── README.md            # 백엔드 전용 README
├── frontend/                 # React 프론트엔드
│   ├── src/
│   │   ├── components/      # 네비게이션 레이아웃, 공용 Badge 등 공통 컴포넌트
│   │   ├── context/         # AuthContext (인증 및 전역 로그인 상태 관리)
│   │   ├── pages/           # 개별 화면 (대시보드, 자산 상세, 예산 설정, 파일 분석 등)
│   │   ├── services/        # Axios 기반 API 연동 모듈 (api.js)
│   │   ├── utils/           # 유틸리티 함수
│   │   ├── App.jsx          # 프론트엔드 라우팅 및 렌더링 루트
│   │   └── index.css        # 스타일 시트 (네비게이션 화살표 스타일 추가)
│   └── package.json         # 프론트엔드 패키지 의존성 파일
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
- **관리자 계정**: admin / admin123
- **일반 계정**: user / user123

---

## API 엔드포인트

### 인증 (Auth)
- `POST /api/auth/login` - 사용자 로그인 (IP 잠금 적용)

### 자산 관리 (Assets)
- `GET /api/assets` - 자산 목록 조회 (서버사이드 페이지네이션, 검색어, 카테고리 필터 매개변수 지원)
- `GET /api/assets/{id}` - 자산 상세 조회
- `POST /api/assets` - 자산 신규 등록 (변경 이력 기록)
- `PUT /api/assets/{id}` - 자산 정보 수정 (변경 이력 기록)
- `DELETE /api/assets/{id}` - 자산 삭제 (변경 이력 기록)
- `GET /api/assets/{id}/history` - 자산 변경 이력(Audit Log) 목록 조회
- `GET /api/assets/{id}/maintenance` - 자산별 유지보수 이력 목록 조회
- `POST /api/assets/{id}/maintenance` - 유지보수 이력 등록
- `PUT /api/assets/{id}/maintenance/{record_id}` - 유지보수 이력 수정
- `DELETE /api/assets/{id}/maintenance/{record_id}` - 유지보수 이력 삭제

### 예산 관리 (Budgets)
- `GET /api/budgets` - 전체 연월 예산 배정 목록 조회
- `PUT /api/budgets/{year}/{month}` - 특정 연월 예산 설정 및 수정
- `DELETE /api/budgets/{year}/{month}` - 특정 연월 예산 삭제

### AI 및 대시보드 분석 (AI)
- `POST /api/ai/natural-language-search` - 자연어 검색 (LLM 파싱 조건으로 DB 조회)
- `POST /api/ai/replacement-recommendation` - 교체 우선순위 추천 (예산 제약 조건 대응)
- `GET /api/ai/maintenance-analysis` - 유지보수 비용/고장 유형 AI 종합 분석 (기간 범위 필터 지원)
- `GET /api/ai/maintenance-analysis/failure-assets` - 특정 고장 유형이 발생한 자산 목록 및 발생 빈도 조회
- `POST /api/ai/qa` / `POST /api/qa/ask` - 자산/유지보수 데이터 컨텍스트 기반 AI 챗봇 질의응답
- `GET /api/reports/monthly` - 월간 종합 분석 보고서 데이터 조회
- `GET /api/reports/monthly/pdf` - 월간 보고서 PDF 다운로드 (한글 폰트 내장)
- `GET /api/dashboard` - 대시보드 통계 및 실시간 예산 대비 소진율 현황 조회

### 파일 업로드 및 가공 (Files)
- `GET /api/files` - 업로드된 파일 정보 목록 조회
- `POST /api/files/upload` - 엑셀/CSV/PDF 견적서 파일 업로드
- `POST /api/files/{id}/process` - PDF 견적서 내 핵심 정보(자산코드, 금액 등) 자동 파싱 분석
- `POST /api/files/{id}/apply` - 파싱 및 추출된 견적서 정보를 실제 유지보수 데이터로 자동 적용 및 데이터베이스 적재
- `DELETE /api/files/{id}` - 업로드된 파일 삭제

---

## 환경 변수 설정 (`backend-py/.env`)

```env
DATABASE_URL=mysql+pymysql://asset:assetpass@127.0.0.1:3306/asset_management?charset=utf8mb4
JWT_SECRET=asset-management-secret-key-for-development
JWT_EXPIRATION_SECONDS=86400
UPLOAD_DIRECTORY=./uploads
DEMO_MODE=true
# Anthropic API Key (AI 기능 실구동 시 필수 입력)
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-5-sonnet
```
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
- `asset_code`: VARCHAR(50) (NOT NULL, UNIQUE) - 식별 코드 (예: ASSET-001)
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
- `cost`: DECIMAL(15, 2) (NOT NULL) - 발생 비용
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
- `extracted_data`: JSON / TEXT - 텍스트 추출 및 정규식 자동 인식 파싱 데이터 (자산코드, 금액 등)
- `error_message`: TEXT - 분석 실패 시 오류 원인 로그
- `applied`: BOOLEAN (DEFAULT FALSE) - 데이터베이스(유지보수 기록 등)에 실제 적용 완료 여부
- `created_at`: TIMESTAMP - 업로드 일시
- `updated_at`: TIMESTAMP - 상태 갱신 일시

### 5. 자산 변경 이력 (`asset_audit_log`) [NEW]
자산의 등록, 수정, 삭제 시 변경된 이전 값과 이후 값의 스냅샷을 기록합니다.
- `id`: BIGINT (PK, Auto Increment)
- `asset_id`: BIGINT (index) - 변경 대상 자산 ID (자산 삭제 후 보존을 위해 외래키 해제)
- `asset_code`: VARCHAR(50) - 자산 식별 코드
- `action`: ENUM('CREATE', 'UPDATE', 'DELETE') (NOT NULL) - 작업 종류
- `changed_by`: VARCHAR(50) - 변경을 수행한 로그인 유저명
- `changes`: TEXT - 변경된 필드들의 변경 전/후 값 스냅샷 (JSON 형식 문자열)
- `created_at`: TIMESTAMP - 로그 기록 일시

### 6. 예산 (`budget`) [NEW]
월별 유지보수 예산 배정 현황을 관리합니다.
- `id`: BIGINT (PK, Auto Increment)
- `year`: INT (NOT NULL) - 배정 연도
- `month`: INT (NOT NULL) - 배정 월
- `allocated_amount`: DECIMAL(15, 2) (NOT NULL) - 배정 예산 금액
- `created_at`: TIMESTAMP - 등록 일시
- `updated_at`: TIMESTAMP - 최종 수정 일시
- *유니크 제약조건*: `(year, month)` 중복 설정 방지

---

## 주요 라이브러리 및 기술 스택

### 백엔드 (Backend)
- **FastAPI**: 초고속 비동기 REST API 프레임워크
- **SQLAlchemy**: 강력한 Python SQL 툴킷 및 ORM
- **PyMySQL / cryptography**: MySQL 연결 드라이버 및 보안 모듈
- **python-jose / passlib[bcrypt]**: JWT 인증 및 암호 해싱 처리
- **anthropic**: Anthropic Claude API 연동 클라이언트
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
