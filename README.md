# 공공시설 유지보수 및 자산관리 AI 시스템

## 아키텍처
- **Backend**: FastAPI (Python), SQLAlchemy, REST API, Anthropic Claude API (LLM)
- **Frontend**: React (Vite, Tailwind CSS)
- **DB**: MySQL / MariaDB

백엔드는 Python 단일 서비스로 통일되어 있으며, 자연어 검색 · 교체 우선순위 추천 · 유지보수 분석 · 보고서 서술 · Q&A는
모두 Claude API(`claude-opus-4-8`)를 호출한다. `ANTHROPIC_API_KEY`가 설정되지 않은 경우 각 기능은
규칙 기반 폴백으로 동작한다(개발/데모 환경에서 키 없이도 기동 가능).

## 주요 기능

### 1. 자산 관리
- 자산 CRUD (등록/수정/삭제/조회)
- 자산명·자산번호 검색, 카테고리 필터링
- 자산별 유지보수 이력 조회 (상세 페이지)

### 2. 자연어 검색
- "5 년 이상 사용한 노트북 보여줘" 같은 자연어 질문 → LLM이 검색조건(카테고리/위치/사용기간/상태)으로 파싱 → DB 조회
- 상단 네비게이션의 "자연어 검색" 메뉴에서 사용

### 3. AI 교체 우선순위 추천
- 사용기간/수리비/고장횟수/구매가 대비 수리비율 기반 점수 계산
- 예산 입력 시 순위별 추천

### 4. AI 유지보수 분석
- 반복고장/누적비용/월별 비용 추이 통계 분석, LLM이 종합 서술 생성

### 5. AI 질의응답 (Q&A)
- 자연어 질문 → 자산/유지보수 데이터를 컨텍스트로 LLM이 답변 생성 (근거 자산까지 함께 반환)
- 채팅형 UI, 추천 질문 제공

### 6. AI 보고서 자동 생성
- 자산 현황/유지보수 비용/교체 추천/주요 문제점/향후 권장사항을 LLM이 요약·서술
- PDF 다운로드 지원 (한글 CID 폰트 사용)

### 7. 파일 업로드
- 엑셀/CSV/PDF 파일 업로드
- 분석 결과 미리보기 및 수동 적용 (프로토타입 단계)

### 8. 데모용 랜덤 대시보드 데이터
- DEMO_MODE 환경변수로 활성화
- ±10~20% 랜덤 변동
- isSimulated 플래그

### 9. 로그인/권한
- JWT 인증
- ADMIN/USER 권한 구분

## 프로젝트 구조

```
Assistant-Project/
├── backend-py/              # FastAPI 백엔드
│   ├── app/
│   │   ├── routers/         # REST API 라우터
│   │   ├── models.py        # SQLAlchemy 모델
│   │   ├── schemas.py       # Pydantic 스키마
│   │   ├── auth.py          # JWT/비밀번호 처리
│   │   ├── config.py        # 환경설정
│   │   └── main.py          # 앱 진입점
│   ├── requirements.txt
│   └── README.md
├── frontend/                 # React 프론트엔드
│   ├── src/
│   │   ├── pages/
│   │   └── utils/
│   └── package.json
└── docs/                     # 문서 (schema.sql 등)
```

## 실행 방법

### 1. 백엔드 실행

```bash
cd backend-py
python -m venv venv          # Windows에서 python3 명령이 없으면 python 사용
source venv/bin/activate     # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env  # DATABASE_URL, ANTHROPIC_API_KEY 등 환경에 맞게 수정
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

백엔드는 `http://localhost:8080` 에서 실행됩니다. 최초 기동 시 테이블을 자동 생성하고
관리자 계정(admin/admin123), 일반 계정(user/user123)을 시딩합니다.

자세한 내용은 `backend-py/README.md` 참고.

#### 데모 데이터 적재 (선택)

앱이 자동 생성하는 것은 테이블과 계정뿐이며, `docs/schema.sql`의 자산/유지보수 샘플 데이터(25건/30건)는
별도로 적재해야 한다. MySQL 클라이언트로 직접 실행할 경우 `utf8mb4` charset을 지정해야 한글이 깨지지 않는다.

```bash
mysql --default-character-set=utf8mb4 -u asset -p asset_management < docs/schema.sql
```

`schema.sql`에는 `CREATE DATABASE`/`user` 테이블 INSERT도 포함되어 있으니, 이미 앱이 만든 테이블/계정과
충돌하지 않도록 자산/유지보수 INSERT 구간만 발췌해서 실행해도 된다.

### 2. 프론트엔드 실행

```bash
cd frontend
npm install
npm run dev
```

프론트엔드는 `http://localhost:5173` 에서 실행됩니다.

## 데모 계정
- **사용자명**: admin
- **비밀번호**: admin123

## API 엔드포인트

### 인증
- `POST /api/auth/login` - 로그인

### 자산
- `GET /api/assets` - 자산 목록 조회
- `GET /api/assets/{id}` - 자산 상세 조회
- `POST /api/assets` - 자산 등록
- `PUT /api/assets/{id}` - 자산 수정
- `DELETE /api/assets/{id}` - 자산 삭제
- `GET /api/assets/{id}/maintenance` - 자산별 유지보수 이력 조회
- `POST /api/assets/{id}/maintenance` - 유지보수 이력 등록

### AI 기능
- `POST /api/ai/natural-language-search` - 자연어 검색 (LLM이 조건을 파싱하여 SQL 조회로 변환)
- `POST /api/ai/replacement-recommendation` - 교체 우선순위 추천 (점수는 규칙 기반, 추천 사유는 LLM 서술)
- `GET /api/ai/maintenance-analysis` - 유지보수 분석 (반복고장/비용추이를 LLM이 종합 서술)
- `POST /api/ai/qa`, `POST /api/qa/ask` - Q&A (자산/유지보수 데이터를 컨텍스트로 LLM 응답)
- `GET /api/reports/monthly` - 월간 보고서 데이터 (JSON, AI 요약/문제점/권장사항 포함)
- `GET /api/reports/monthly/pdf` - 월간 보고서 PDF 다운로드
- `GET /api/dashboard` - 대시보드 데이터

### 파일
- `GET /api/files` - 업로드 파일 목록
- `POST /api/files/upload` - 파일 업로드
- `POST /api/files/{id}/process` - 파일 분석(Mock)
- `POST /api/files/{id}/apply` - 분석 결과 적용
- `DELETE /api/files/{id}` - 파일 삭제

## 환경 변수 설정 (backend-py/.env)

```env
DATABASE_URL=mysql+pymysql://asset:assetpass@127.0.0.1:3306/asset_management?charset=utf8mb4
JWT_SECRET=asset-management-secret-key-for-development
JWT_EXPIRATION_SECONDS=86400
UPLOAD_DIRECTORY=./uploads
DEMO_MODE=true
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-opus-4-8
```

`ANTHROPIC_API_KEY`를 비워두면 AI 기능은 규칙 기반 폴백으로 동작한다(응답에 안내 문구가 붙는다).
실제 LLM 응답을 사용하려면 [Anthropic Console](https://console.anthropic.com)에서 발급한 키를 입력한다.

## 기술 스택

### 백엔드
- FastAPI
- SQLAlchemy
- PyMySQL
- python-jose (JWT)
- passlib[bcrypt]
- anthropic (Claude API)
- reportlab (PDF 생성, 한글 CID 폰트 사용)
- MySQL / MariaDB

### 프론트엔드
- React 19
- Vite
- Tailwind CSS
- Axios
- React Router
- Recharts
- Lucide React (아이콘)

## 데이터베이스 스키마

### Asset (자산)
- id, assetName, assetCode, category, location
- responsiblePerson, purchaseDate, purchasePrice
- usefulLife, status, description

### MaintenanceRecord (유지보수 이력)
- id, assetId, maintenanceDate, maintenanceType
- cost, description, technician, failureType

### User (app_user 테이블)
- id, username, password, role, email

### FileUpload (파일 업로드)
- id, filename, originalFilename, fileType, filePath
- status, extractedData, errorMessage, applied

## 개발 가이드

### 코드 컨벤션
- 백엔드: Python 3.10+, PEP 8
- 프론트엔드: React Hooks, 함수형 컴포넌트
- 네이밍: camelCase(API 응답 필드), snake_case(Python 내부), PascalCase(클래스/컴포넌트)

### Git 워크플로우
1. feature 브랜치 생성
2. 작업 완료 후 commit
3. PR 생성 및 리뷰
4. main 브랜치 merge

## 문제 해결

### 백엔드 시작 안 됨
- MySQL/MariaDB가 실행 중인지, DATABASE_URL이 올바른지 확인
- 한글 데이터 오류 발생 시 DB/커넥션 문자열에 `utf8mb4` charset이 설정되어 있는지 확인
- `passlib`/`bcrypt` 버전이 어긋나면(예: `bcrypt`가 4.1 이상으로 별도 설치된 경우) 로그인 계정 시딩 단계에서
  `password cannot be longer than 72 bytes` 에러와 함께 기동이 실패한다. `pip install -r requirements.txt`로
  `requirements.txt`에 고정된 버전(`bcrypt==4.0.1`)을 그대로 설치했는지 확인할 것.

### 프론트엔드 빌드 오류
- node_modules 재설치: `rm -rf node_modules && npm install`

### AI 기능이 안내 문구만 반환함
- `.env`의 `ANTHROPIC_API_KEY`가 비어 있으면 자연어 검색/추천/분석/보고서/Q&A는 규칙 기반 폴백으로 동작하며
  응답 문구 끝에 "(ANTHROPIC_API_KEY를 설정하세요)" 안내가 붙는다. 실제 LLM 응답을 받으려면 키를 설정하고
  백엔드를 재시작한다.

## 라이선스
MIT License
