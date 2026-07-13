# Project Rules

- **Git 커밋 메시지 작성 규칙**: 앞으로 변경 사항을 커밋하거나 푸시할 때, Git 커밋 메시지(Commit Message)는 반드시 한국어로 작성하십시오.

- **프론트엔드 배포 규칙**:
  - 프론트엔드(React) 소스코드가 변경되었을 때, 단순히 git push/pull만 수행하면 프로덕션 서버에 반영되지 않습니다.
  - 반드시 로컬의 `frontend` 경로에서 `npm run build` 명령을 실행하여 최신 정적 파일을 빌드하십시오.
  - 빌드된 결과물(`dist/*`)을 SSH 키(`C:\ssh-key.key`)를 사용해 원격 서버의 `/var/www/asset-app/` 폴더로 `scp` 복사 전송하여 배포 작업을 마쳐야 합니다.
  - 예시 명령어:
    1. 빌드: `cd frontend && npm run build`
    2. 서버 정적 폴더 교체: `scp -i C:\ssh-key.key -r frontend/dist/* rocky@217.142.238.104:/var/www/asset-app/`
