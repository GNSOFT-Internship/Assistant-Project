# 공공시설 유지보수 및 자산관리 AI 시스템

## 아키텍처
- **Backend**: FastAPI (Python), SQLAlchemy, REST API
- **Frontend**: React (Vite, Tailwind CSS)
- **DB**: MySQL / MariaDB

## 주요 기능

### 1. 자산 관리
- 자산 CRUD (등록/삭제/조회)
- 자산 검색 및 필터링
- 유지보수 이력 관리

### 2. 자연어 검색
- "5 년 이상 사용한 노트북 보여줘" 같은 자연어 질문 → 검색조건 변환

### 3. AI 교체 우선순위 추천
- 사용기간/수리비/고장횟수/구매가 대비 수리비율 기반 점수 계산
- 예산 입력 시 순위별 추천

### 4. AI 유지보수 분석
- 반복고장/누적비용 통계 분석

### 5. AI 질의응답 (Q&A)
- 자연어 질문 → DB 데이터 조회 기반 답변
- 채팅형 UI

### 6. 파일 업로드
- 엑셀/CSV/PDF 파일 업로드
- 분석 결과 미리보기 및 수동 적용 (프로토타입 단계)

### 7. 데모용 랜덤 대시보드 데이터
- DEMO_MODE 환경변수로 활성화
- ±10~20% 랜덤 변동
- isSimulated 플래그

### 8. 로그인/권한
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
python3 -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env  # DATABASE_URL 등 환경에 맞게 수정
uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
```

백엔드는 `http://localhost:8080` 에서 실행됩니다. 최초 기동 시 테이블을 자동 생성하고
관리자 계정(admin/admin123), 일반 계정(user/user123)을 시딩합니다.

자세한 내용은 `backend-py/README.md` 참고.

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
- `DELETE /api/assets/{id}` - 자산 삭제

### AI 기능
- `POST /api/ai/natural-language-search` - 자연어 검색
- `POST /api/ai/replacement-recommendation` - 교체 추천
- `GET /api/ai/maintenance-analysis` - 유지보수 분석
- `POST /api/ai/qa`, `POST /api/qa/ask` - Q&A
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
```

## 기술 스택

### 백엔드
- FastAPI
- SQLAlchemy
- PyMySQL
- python-jose (JWT)
- passlib[bcrypt]
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

### 프론트엔드 빌드 오류
- node_modules 재설치: `rm -rf node_modules && npm install`

## 라이선스
MIT License
