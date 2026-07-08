# Asset Management API (Python)

기존 Spring Boot(Java) 백엔드를 FastAPI로 이식한 버전입니다. 프론트엔드는 수정 없이 그대로 사용할 수 있도록
`http://localhost:8080/api/...` 경로와 응답 형식(`{success, message, data}`)을 동일하게 맞췄습니다.

## 실행 방법

1. MySQL(또는 MariaDB)에 `asset_management` 데이터베이스를 utf8mb4로 생성합니다.

   ```sql
   CREATE DATABASE asset_management CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'asset'@'%' IDENTIFIED BY 'assetpass';
   GRANT ALL ON asset_management.* TO 'asset'@'%';
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
- `/api/ai/*` 엔드포인트(자연어 검색, 교체 우선순위 추천, 유지보수 분석)는 별도 LLM 호출 없이 DB 데이터 기반
  규칙으로 동작하는 프로토타입 로직입니다 (기존 Java 버전과 동일한 접근 방식).
