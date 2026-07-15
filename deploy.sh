#!/bin/bash
# 프로덕션 서버(rocky@217.142.238.104)에서 직접 실행하는 배포 스크립트.
# 로컬에서 실행하는 게 아니라, 서버에 SSH로 접속한 뒤 이 스크립트를 돌린다:
#
#   ssh -i C:\ssh-key.key rocky@217.142.238.104 "sudo bash /root/Assistant-Project/deploy.sh"
#
# 이 스크립트를 돌리기 전에 로컬에서 반드시 테스트를 통과시키고 커밋/푸시까지 끝내둔다
# (백엔드: cd backend-py && python -m pytest tests/ -q / 프론트엔드: cd frontend && npx vitest run).
# 이 스크립트는 "이미 검증된 커밋을 프로덕션에 반영하고, 반영됐는지 확인"하는 것만 한다 —
# 테스트를 대신 돌려주지 않는다.

set -euo pipefail

PROJECT_DIR="/root/Assistant-Project"
SITE_URL="https://intern-pj.duckdns.org"

cd "$PROJECT_DIR"

echo "=== 1. git pull ==="
BEFORE=$(git rev-parse HEAD)
git pull origin main
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
  echo "이미 최신 상태입니다 (배포할 변경 사항 없음). 종료합니다."
  exit 0
fi

CHANGED_FILES=$(git diff --name-only "$BEFORE" "$AFTER")
echo "변경된 파일:"
echo "$CHANGED_FILES"
echo

BACKEND_TRACEBACK_FOUND=0

if echo "$CHANGED_FILES" | grep -q '^backend-py/'; then
  echo "=== 2. 백엔드 재시작 (backend-py/ 변경 감지) ==="
  systemctl restart asset-backend
  sleep 3
  systemctl is-active asset-backend

  echo "--- 최근 로그 (트레이스백 확인) ---"
  RECENT_LOGS=$(journalctl -u asset-backend --since '20 seconds ago' --no-pager)
  echo "$RECENT_LOGS"

  if echo "$RECENT_LOGS" | grep -qi 'Traceback\|Error:'; then
    BACKEND_TRACEBACK_FOUND=1
    echo
    echo "!!! 경고: 재시작 로그에서 에러/트레이스백이 발견됐습니다. 위 로그를 직접 확인하세요. !!!"
  fi
else
  echo "=== 2. 백엔드 변경 없음 — 재시작 생략 ==="
fi
echo

if echo "$CHANGED_FILES" | grep -q '^frontend/'; then
  echo "=== 3. 프론트엔드 재빌드 (frontend/ 변경 감지) ==="
  (cd frontend && npm run build)
  cp -r frontend/dist/* /var/www/asset-app/
else
  echo "=== 3. 프론트엔드 변경 없음 — 재빌드 생략 ==="
fi
echo

echo "=== 4. 배포 후 검증 ==="

# systemctl restart 직후 몇 초간은 uvicorn이 아직 리스닝을 시작하기 전이라
# nginx가 502를 반환하는 정상적인 과도기가 있다. 재시작을 한 경우, 응답이
# 401(정상)이 될 때까지 몇 번 재시도해서 이 과도기를 실패로 오판하지 않는다.
if echo "$CHANGED_FILES" | grep -q '^backend-py/'; then
  for i in 1 2 3 4 5; do
    API_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SITE_URL/api/dashboard")
    if [ "$API_HTTP_CODE" = "401" ]; then
      break
    fi
    echo "  API 응답 $API_HTTP_CODE — 아직 기동 중일 수 있어 2초 후 재시도 ($i/5)"
    sleep 2
  done
fi

SITE_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SITE_URL/")
echo "사이트 응답: $SITE_HTTP_CODE"

API_HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$SITE_URL/api/dashboard")
echo "API 응답: $API_HTTP_CODE (401이면 정상 — 인증 없이 호출했을 때의 기대값)"

if echo "$CHANGED_FILES" | grep -q '^frontend/'; then
  SERVED_HASH=$(curl -s "$SITE_URL/" | grep -o '/assets/index-[^"]*\.js' | head -1)
  LOCAL_HASH=$(grep -o '/assets/index-[^"]*\.js' /var/www/asset-app/index.html | head -1)
  echo "서빙 중인 번들: $SERVED_HASH"
  echo "방금 빌드된 번들: $LOCAL_HASH"
  if [ "$SERVED_HASH" != "$LOCAL_HASH" ]; then
    echo "!!! 경고: 서빙되는 번들 해시가 방금 빌드한 것과 다릅니다. 캐시/배포 경로를 확인하세요. !!!"
  fi
fi

echo
if [ "$SITE_HTTP_CODE" != "200" ] || [ "$BACKEND_TRACEBACK_FOUND" = "1" ]; then
  echo "=== 배포 완료됐지만 위 경고를 반드시 확인하세요 ==="
  exit 1
fi

echo "=== 배포 완료 ==="
