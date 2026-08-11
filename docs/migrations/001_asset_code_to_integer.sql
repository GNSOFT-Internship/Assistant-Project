-- 001_asset_code_to_integer.sql
--
-- asset.asset_code / asset_audit_log.asset_code를 자유 입력 문자열(VARCHAR)에서
-- 서버가 자동 채번하는 정수(INT)로 전환한다. 기존 자산은 asset.id 오름차순 기준으로
-- 1번부터 새로 채번한다 (기존 'ASSET-001' 같은 코드 값은 폐기된다).
--
-- 적용 방법 (운영 MySQL DB, 최초 1회):
--   mysql -u <user> -p asset_management < docs/migrations/001_asset_code_to_integer.sql
--
-- 요구사항: MySQL 8.0+ (윈도우 함수 ROW_NUMBER() 사용)
-- 주의: 반드시 실행 전 DB 백업을 먼저 떠 두세요.

START TRANSACTION;

-- 1) 새 정수 코드를 담을 임시 컬럼 추가
ALTER TABLE `asset` ADD COLUMN `asset_code_new` INT NULL;

-- 2) id 오름차순으로 1부터 새로 채번
UPDATE `asset` a
JOIN (
    SELECT `id`, ROW_NUMBER() OVER (ORDER BY `id`) AS `rn`
    FROM `asset`
) ranked ON ranked.`id` = a.`id`
SET a.`asset_code_new` = ranked.`rn`;

-- 3) 현재 존재하는 자산에 대한 감사 로그 스냅샷을 새 코드로 동기화
--    (asset_audit_log.asset_id는 FK가 아니라 자산이 삭제돼도 남아있을 수 있으므로,
--     아직 남아있는 자산에 대한 로그만 새 코드로 갱신한다)
UPDATE `asset_audit_log` al
JOIN `asset` a ON a.`id` = al.`asset_id`
SET al.`asset_code` = a.`asset_code_new`;

-- 4) 이미 삭제된 자산을 가리키는 로그는 옛 문자열 코드를 새 정수 체계로 옮길 방법이
--    없으므로 NULL로 비운다 (스냅샷 컬럼은 nullable)
UPDATE `asset_audit_log` al
LEFT JOIN `asset` a ON a.`id` = al.`asset_id`
SET al.`asset_code` = NULL
WHERE a.`id` IS NULL;

-- 5) asset_audit_log.asset_code 타입을 INT로 변경 (지금까지 값은 전부 숫자 문자열 또는 NULL)
ALTER TABLE `asset_audit_log` MODIFY COLUMN `asset_code` INT NULL;

-- 6) asset 테이블: 옛 VARCHAR 컬럼을 버리고 새 INT 컬럼을 asset_code로 승격
ALTER TABLE `asset` DROP COLUMN `asset_code`;
ALTER TABLE `asset` CHANGE COLUMN `asset_code_new` `asset_code` INT NOT NULL;
ALTER TABLE `asset` ADD UNIQUE KEY `uq_asset_asset_code` (`asset_code`);

COMMIT;
