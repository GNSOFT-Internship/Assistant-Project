-- 002_category_to_table.sql
--
-- asset.category / category_importance.category(자유 입력 문자열, 각자 별도 자연키)를
-- 하나의 category 테이블로 정규화하고 양쪽 모두 category_id FK로 참조하게 한다.
-- 두 테이블에 같은 카테고리명이 오타 등으로 서로 다르게 저장되어 있으면 정합성이
-- 깨질 수 있었던 문제(예: "IT 장비" vs "IT장비")를 DB 제약으로 원천 차단한다.
--
-- 적용 방법 (운영 MySQL DB, 001_asset_code_to_integer.sql 이후 최초 1회):
--   mysql -u <user> -p asset_management < docs/migrations/002_category_to_table.sql
--
-- 요구사항: MySQL 8.0+
-- 주의: 반드시 실행 전 DB 백업을 먼저 떠 두세요.

START TRANSACTION;

-- 1) category 마스터 테이블 생성
CREATE TABLE `category` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL UNIQUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2) asset/category_importance 양쪽에 등장하는 모든 카테고리명을 중복 없이 채운다
--    (두 테이블의 값이 실제로는 같아야 정상이지만, 혹시 어긋나 있던 값도 전부 보존한다)
INSERT INTO `category` (`name`)
SELECT DISTINCT `category` FROM `asset`
UNION
SELECT DISTINCT `category` FROM `category_importance`;

-- 3) asset: category_id 컬럼 추가 후 이름으로 매핑해 채우고, 제약을 건다
ALTER TABLE `asset` ADD COLUMN `category_id` BIGINT NULL;
UPDATE `asset` a
JOIN `category` c ON c.`name` = a.`category`
SET a.`category_id` = c.`id`;
ALTER TABLE `asset` MODIFY COLUMN `category_id` BIGINT NOT NULL;
ALTER TABLE `asset` ADD FOREIGN KEY (`category_id`) REFERENCES `category`(`id`);
ALTER TABLE `asset` DROP INDEX `idx_category`;
ALTER TABLE `asset` DROP COLUMN `category`;

-- 4) category_importance: 동일하게 category_id로 교체
ALTER TABLE `category_importance` ADD COLUMN `category_id` BIGINT NULL;
UPDATE `category_importance` ci
JOIN `category` c ON c.`name` = ci.`category`
SET ci.`category_id` = c.`id`;
ALTER TABLE `category_importance` MODIFY COLUMN `category_id` BIGINT NOT NULL;
ALTER TABLE `category_importance` ADD UNIQUE KEY `uq_category_importance_category_id` (`category_id`);
ALTER TABLE `category_importance` ADD FOREIGN KEY (`category_id`) REFERENCES `category`(`id`);
ALTER TABLE `category_importance` DROP COLUMN `category`;

COMMIT;
