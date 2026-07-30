# Asset Management API (Python)

기존 Spring Boot(Java) 백엔드를 FastAPI로 이식한 버전입니다. 프론트엔드는 수정 없이 그대로 사용할 수 있도록
`http://localhost:8080/api/...` 경로와 응답 형식(`{success, message, data}`)을 동일하게 맞췄습니다.

## 실행 방법

1. MySQL(또는 MariaDB)에 `asset_management` 데이터베이스를 utf8mb4로 생성합니다.

   ```sql
   CREATE DATABASE asset_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'asset'@'%' IDENTIFIED BY 'assetpass';
   -- ALL 대신 앱이 실제로 쓰는 권한만 부여한다 (최소 권한 원칙). SELECT/INSERT/UPDATE/DELETE는
   -- 통상적인 CRUD용이고, CREATE/ALTER/INDEX/REFERENCES는 최초 기동 시 SQLAlchemy의
   -- Base.metadata.create_all()이 테이블을 자동 생성하기 위해 필요하다. DROP·GRANT OPTION·
   -- 계정 관리 등 관리자 권한은 애플리케이션 계정에 절대 주지 않는다.
   GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON asset_management.* TO 'asset'@'%';
   ```

2. `.env.example`을 `.env`로 복사하고 `DATABASE_URL` 등을 환경에 맞게 수정합니다. (연결 문자열에 `?charset=utf8mb4`가
   반드시 포함되어야 한글이 깨지지 않습니다.)

3. 의존성 설치 및 서버 실행

   ```bash
   python3 -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   pip install -r requirements.txt
   uvicorn app.main:app --host 0.0.0.0 --port 8080 --reload
   ```

   최초 기동 시 테이블을 자동 생성하고 관리자 계정(admin/admin123)과 일반 계정(user/user123)을 시딩합니다.

## 기존 Java 백엔드와의 차이점

- 인증: Spring Security 대신 `python-jose`(JWT) + `passlib[bcrypt]` 사용. 기존 `$2a$` bcrypt 해시와 호환됩니다.
- ORM: JPA/Hibernate 대신 SQLAlchemy 사용.
- `docs/schema.sql`의 테이블명은 `user`이지만, 실제 Java 엔티티는 `app_user`로 매핑되어 있었습니다(MySQL 예약어
  회피 목적으로 추정). 이 Python 버전도 `app_user`를 그대로 사용합니다.
- `/api/ai/*` 엔드포인트(자연어 검색, 교체 우선순위 추천, 유지보수 분석, 작업 지시서, 예산 예측/시뮬레이터,
  조달 규격서, 고장 진단 챗봇), `/api/qa/ask`, `/api/reports/monthly`는 `GN_API_KEY`가 설정된 경우
  사내 GPU 서버(gn-cab) 경유 Qwen3.5를 호출해 한국어 서술을 생성합니다. 없으면 규칙 기반
  폴백 문구로 동작합니다. 유지보수 분석의 AI 서술과 보고서의 AI 요약/문제점/권장사항은 토큰 절약을 위해
  `includeAi=true` 파라미터(프론트엔드의 "AI 분석하기"/"AI 요약 보기" 버튼)를 명시했을 때만 생성됩니다.
  보고서의 "AI 요약 보기"는 `GET /reports/monthly?includeAi=true`를 다시 부르는 대신, 화면에 이미
  있는 통계를 그대로 `POST /reports/monthly/narrative`로 보내 AI 서술만 받아옵니다(DB 재조회 없음).
- 자연어 검색과 Q&A는 가격/카테고리 조건이 있으면 LLM이 숫자·문자열만 추출하고, 실제 필터링·비교는
  항상 서버 코드가 재계산합니다. LLM이 조건과 안 맞는 후보를 골라도 최종 결과는 항상 정확합니다.
- 위 AI 호출 엔드포인트들은 `app/rate_limit.py`의 슬라이딩 윈도우 제한(`main.py`에서 라우터 단위로 적용)으로
  분당 호출 횟수가 제한되어 있습니다. gn-cab API 키 자체의 분당 호출 제한을 넘지 않도록 하기 위한 것으로,
  초과 시 `429 Too Many Requests`를 반환합니다.
- 자산/예산/유지보수 이력/파일 업로드의 쓰기(생성·수정·삭제) 엔드포인트는 `require_admin` 의존성으로 보호되어
  `ADMIN` 역할만 호출할 수 있고, `USER` 역할은 조회만 가능합니다.
- `backend-py/tests/`에 pytest 기반 자동화 테스트가 있습니다 (`cd backend-py && pytest`). GitHub Actions로
  `backend-py` 변경 시마다 자동 실행됩니다.
- 프로덕션 배포는 저장소 루트의 `deploy.sh`를 서버에서 실행합니다 (`sudo bash /root/Assistant-Project/deploy.sh`).
  git pull 이후 바뀐 부분(`backend-py/`, `frontend/`)만 골라 재시작/재빌드하고, 배포 후 사이트·API 응답과
  백엔드 트레이스백 여부까지 자동으로 확인합니다. `main`에 push되면 `.github/workflows/deploy.yml`이
  pytest/vitest를 한 번 더 통과시킨 뒤 서버에 SSH로 접속해 이 스크립트를 자동으로 실행하므로, 수동으로
  서버에 접속해 배포할 필요가 없습니다 (SSH 개인키는 `DEPLOY_SSH_KEY` GitHub Secret으로 등록되어 있음).
