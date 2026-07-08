# 공공시설 유지보수 및 자산관리 AI 시스템

## 아키텍처
- **Backend**: Spring Boot 3.x (Java 17), Gradle, REST API
- **AI Server**: Python FastAPI
- **Frontend**: React (Vite, Tailwind CSS)
- **DB**: H2 (Dev), MySQL (Prod)

## 주요 기능

### 1. 자산 관리
- 자산 CRUD (등록/수정/삭제/조회)
- 자산 검색 및 필터링
- 유지보수 이력 타임라인

### 2. 자연어 검색
- "3 년 이상 사용한 노트북 보여줘" 같은 자연어 질문 → JSON 검색조건 변환
- LLM 기반 스마트 검색

### 3. AI 교체 우선순위 추천
- 사용기간/수리비/고장횟수/구매가 대비 수리비율 기반 점수 계산
- 예산 입력 시 순위별 추천

### 4. AI 유지보수 분석
- 반복고장/비용증가율 통계 분석
- Recharts 차트 시각화

### 5. AI 질의응답 (Q&A)
- 자연어 질문 → DB 데이터 조회 → LLM 기반 답변
- 채팅형 UI

### 6. AI 보고서 자동생성
- 자산현황/유지보수비용/교체추천/문제점 종합
- PDF 다운로드

### 7. 파일 업로드 + AI 분석
- 엑셀/CSV/PDF 파일 업로드
- AI 기반 데이터 추출 (자산명/수리비용/수리일/고장유형)
- 미리보기 및 수동 적용

### 8. 데모용 랜덤 대시보드 데이터
- DEMO_MODE 환경변수로 활성화
- ±10~20% 랜덤 변동
- isSimulated 플래그

### 9. 로그인/권한
- JWT 인증
- ADMIN/USER 권한 구분

## 프로젝트 구조

```
C:\Myproject3/
├── backend/                 # Spring Boot 백엔드
│   ├── src/main/java/com/asset/
│   │   ├── config/         # 설정 클래스
│   │   ├── controller/     # REST API 컨트롤러
│   │   ├── dto/            # 데이터 전송 객체
│   │   ├── entity/         # JPA 엔티티
│   │   ├── repository/     # 데이터 액세스
│   │   └── service/        # 비즈니스 로직
│   └── build.gradle
├── ai-server/              # FastAPI AI 서버
│   ├── main.py
│   └── requirements.txt
├── frontend/               # React 프론트엔드
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── utils/
│   └── package.json
└── docs/                   # 문서
```

## 실행 방법

### 1. 백엔드 실행

```bash
cd backend
gradle bootRun
```

백엔드는 `http://localhost:8080` 에서 실행됩니다.

### 2. AI 서버 실행

```bash
cd ai-server
pip install -r requirements.txt
python main.py
```

AI 서버는 `http://localhost:8001` 에서 실행됩니다.

### 3. 프론트엔드 실행

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
- `POST /api/auth/register` - 등록

### 자산
- `GET /api/assets` - 자산 목록 조회
- `GET /api/assets/{id}` - 자산 상세 조회
- `POST /api/assets` - 자산 등록
- `PUT /api/assets/{id}` - 자산 수정
- `DELETE /api/assets/{id}` - 자산 삭제
- `POST /api/assets/search` - 자산 검색

### AI 기능
- `POST /api/ai/natural-language-search` - 자연어 검색
- `POST /api/ai/replacement-recommendation` - 교체 추천
- `GET /api/ai/maintenance-analysis` - 유지보수 분석
- `POST /api/ai/qa` - Q&A
- `GET /api/dashboard` - 대시보드 데이터

### 파일
- `POST /api/files/upload` - 파일 업로드
- `POST /api/files/{id}/process` - 파일 분석
- `POST /api/files/{id}/apply` - 분석 결과 적용
- `DELETE /api/files/{id}` - 파일 삭제

### 보고서
- `GET /api/reports/generate` - PDF 보고서 생성

## 환경 변수 설정

### application.properties (백엔드)
```properties
# AI 서버 URL
ai.server.url=http://localhost:8001

# Claude API 키 (선택사항)
claude.api.key=your-api-key

# 데모 모드
demo.mode=false

# 파일 업로드 디렉토리
upload.directory=./uploads
```

## 기술 스택

### 백엔드
- Spring Boot 3.2.0
- Spring Data JPA
- Spring Security
- JWT (jjwt)
- H2 Database / MySQL
- Lombok
- iText (PDF 생성)

### AI 서버
- FastAPI
- Pydantic
- Uvicorn

### 프론트엔드
- React 18
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

### User (사용자)
- id, username, password, role, email

### FileUpload (파일 업로드)
- id, filename, originalFilename, fileType, filePath
- status, extractedData, errorMessage, applied

## 개발 가이드

### 코드 컨벤션
- 백엔드: Java 17, Spring Boot 스타일 가이드
- 프론트엔드: React Hooks, 함수형 컴포넌트
- 네이밍: camelCase (변수/함수), PascalCase (클래스/컴포넌트)

### Git 워크플로우
1. feature 브랜치 생성
2. 작업 완료 후 commit
3. PR 생성 및 리뷰
4. main 브랜치 merge

## 문제 해결

### 백엔드 시작 안 됨
- Java 17 설치 확인
- Gradle 캐시 클리어: `gradle clean`

### 프론트엔드 빌드 오류
- node_modules 재설치: `rm -rf node_modules && npm install`
- package.json 버전 확인

### AI 서버 연결 안 됨
- 포트 8001 사용 확인
- requirements.txt 의존성 설치 확인

## 라이선스
MIT License