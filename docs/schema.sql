-- 공공시설 유지보수 및 자산관리 시스템 DB 스키마

CREATE DATABASE IF NOT EXISTS asset_management;
USE asset_management;

-- User 테이블 (권한 관리 - 기존 user에서 app_user로 테이블명 동기화)
CREATE TABLE `app_user` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `username` VARCHAR(50) NOT NULL UNIQUE,
    `password` VARCHAR(255) NOT NULL,
    `role` ENUM('ADMIN', 'USER') NOT NULL DEFAULT 'USER',
    `email` VARCHAR(100),
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Category 테이블 (자산 카테고리 마스터)
CREATE TABLE `category` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `name` VARCHAR(100) NOT NULL UNIQUE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Asset 테이블 (자산 관리)
CREATE TABLE `asset` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `asset_name` VARCHAR(200) NOT NULL,
    `asset_code` INT NOT NULL UNIQUE COMMENT '시스템이 자동 채번하는 자산번호 (1부터 순차 증가)',
    `category_id` BIGINT NOT NULL,
    `location` VARCHAR(200),
    `responsible_person` VARCHAR(100),
    `purchase_date` DATE NOT NULL,
    `purchase_price` DECIMAL(15, 2) NOT NULL,
    `useful_life` INT NOT NULL COMMENT '내용연수 (년)',
    `status` ENUM('ACTIVE', 'INACTIVE', 'REPLACEMENT_NEEDED', 'UNDER_MAINTENANCE') NOT NULL DEFAULT 'ACTIVE',
    `description` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`category_id`) REFERENCES `category`(`id`),
    INDEX `idx_status` (`status`),
    INDEX `idx_purchase_date` (`purchase_date`)
);

-- MaintenanceRecord 테이블 (유지보수 이력)
CREATE TABLE `maintenance_record` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `asset_id` BIGINT NOT NULL,
    `maintenance_date` DATE NOT NULL,
    `maintenance_type` ENUM('ROUTINE', 'REPAIR', 'REPLACEMENT', 'INSPECTION') NOT NULL,
    `cost` DECIMAL(15, 2),
    `description` TEXT,
    `technician` VARCHAR(100),
    `failure_type` VARCHAR(200),
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`asset_id`) REFERENCES `asset`(`id`) ON DELETE CASCADE,
    INDEX `idx_asset_id` (`asset_id`),
    INDEX `idx_maintenance_date` (`maintenance_date`)
);

-- FileUpload 테이블 (파일 업로드 및 분석)
CREATE TABLE `file_upload` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `filename` VARCHAR(255),
    `original_filename` VARCHAR(255),
    `file_type` ENUM('EXCEL', 'CSV', 'PDF'),
    `file_path` VARCHAR(500),
    `status` ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `extracted_data` JSON,
    `error_message` TEXT,
    `applied` BOOLEAN DEFAULT FALSE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- AssetAuditLog 테이블 (자산 변경 로그)
CREATE TABLE `asset_audit_log` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `asset_id` BIGINT NOT NULL,
    `asset_code` INT,
    `action` ENUM('CREATE', 'UPDATE', 'DELETE') NOT NULL,
    `changed_by` VARCHAR(50),
    `changes` TEXT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_audit_asset_id` (`asset_id`)
);

-- ChatMessage 테이블 (대화 기록)
CREATE TABLE `chat_message` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `role` ENUM('USER', 'AI') NOT NULL,
    `content` TEXT NOT NULL,
    `assets` TEXT,
    `has_filter` BOOLEAN DEFAULT FALSE,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON DELETE CASCADE,
    INDEX `idx_chat_user_id` (`user_id`),
    INDEX `idx_chat_created_at` (`created_at`)
);

-- Budget 테이블 (월별 예산 배정)
CREATE TABLE `budget` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `year` INT NOT NULL,
    `month` INT NOT NULL,
    `allocated_amount` DECIMAL(15, 2) NOT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_budget_year_month` (`year`, `month`)
);

-- CategoryImportance 테이블 (자산 카테고리별 업무 중요도 점수, 교체 우선순위 계산에 사용)
CREATE TABLE `category_importance` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `category_id` BIGINT NOT NULL UNIQUE,
    `importance_score` DECIMAL(5, 1) NOT NULL,
    `reason` TEXT,
    `source` ENUM('AI', 'MANUAL', 'DEFAULT') NOT NULL DEFAULT 'DEFAULT',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`category_id`) REFERENCES `category`(`id`)
);

-- AssetReplacementReason 테이블 (교체 우선순위 추천 사유 AI 생성 텍스트 캐시)
CREATE TABLE `asset_replacement_reason` (
    `asset_id` BIGINT PRIMARY KEY,
    `metrics_hash` VARCHAR(64) NOT NULL,
    `reason` TEXT NOT NULL,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (`asset_id`) REFERENCES `asset`(`id`) ON DELETE CASCADE
);

-- WorkOrder 테이블 (AI 유지보수 작업 지시서)
CREATE TABLE `work_order` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `maintenance_record_id` BIGINT NOT NULL UNIQUE,
    `title` VARCHAR(255) NOT NULL,
    `steps` TEXT NOT NULL COMMENT '단계별 조치 사항 (JSON array)',
    `required_tools` TEXT COMMENT '필요 공구 및 자재 (JSON array)',
    `safety_precautions` TEXT COMMENT '안전 주의사항 (JSON array)',
    `estimated_time` VARCHAR(100) COMMENT '예상 작업 시간',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`maintenance_record_id`) REFERENCES `maintenance_record`(`id`) ON DELETE CASCADE
);

-- 더미 데이터 삽입

-- 관리자/사용자 계정 (password: admin123)
INSERT INTO `app_user` (`username`, `password`, `role`, `email`) VALUES
('admin', '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iKTVKIUi', 'ADMIN', 'admin@example.com'),
('user1', '$2a$10$N.zmdr9k7uOCQb376NoUnuTJ8iAt6Z5EHsM8lE9lBOsl7iKTVKIUi', 'USER', 'user1@example.com');

-- 카테고리 마스터 데이터
INSERT INTO `category` (`name`) VALUES
('IT 장비'),
('사무기기'),
('설비'),
('전기설비'),
('안전설비'),
('보안장비'),
('가구'),
('측정장비');

-- 자산 데이터 (20 건 이상)
INSERT INTO `asset` (`asset_name`, `asset_code`, `category_id`, `location`, `responsible_person`, `purchase_date`, `purchase_price`, `useful_life`, `status`, `description`) VALUES
('노트북 Dell Latitude 5520', 1, 1, '본관 1 층 사무실', '김철수', '2019-06-15', 1200000, 5, 'ACTIVE', '개발팀용 고사양 노트북'),
('노트북 HP EliteBook 840', 2, 1, '본관 2 층 회의실', '이영희', '2020-03-20', 1500000, 5, 'ACTIVE', '관리팀용 노트북'),
('데스크톱 Lenovo ThinkCentre', 3, 1, '본관 3 층', '박민수', '2018-09-10', 800000, 5, 'REPLACEMENT_NEEDED', '구형 모델, 성능 저하'),
('프린터 HP LaserJet Pro', 4, 2, '본관 1 층', '김철수', '2021-01-15', 450000, 7, 'ACTIVE', '레이저 프린터'),
('복사기 Canon imageRUNNER', 5, 2, '본관 1 층', '이영희', '2017-05-20', 2500000, 10, 'UNDER_MAINTENANCE', '정기점검 중'),
('에어컨 삼성 스탠드형', 6, 3, '본관 2 층', '박민수', '2019-07-01', 600000, 10, 'ACTIVE', '20 평형 스탠드 에어컨'),
('에어컨 LG 벽걸이', 7, 3, '본관 3 층', '김철수', '2020-06-15', 400000, 10, 'ACTIVE', '14 평형 벽걸이'),
('UPS 배터리스톱', 8, 4, '본관 지하', '이영희', '2018-03-10', 1800000, 8, 'REPLACEMENT_NEEDED', '배터리 수명 다됨'),
('화재경보기 호니웰', 9, 5, '전체 구역', '박민수', '2016-11-20', 3200000, 15, 'ACTIVE', '연동형 화재경보 시스템'),
('소화기 분말형 6kg', 10, 5, '각 층', '김철수', '2020-01-10', 35000, 10, 'ACTIVE', '층당 10 개씩 배치'),
('엘리베이터 현대엘리베이터', 11, 3, '본관', '이영희', '2015-04-01', 15000000, 20, 'ACTIVE', '승객용 2 대'),
('비상조명등', 12, 4, '전체 구역', '박민수', '2019-08-15', 850000, 10, 'ACTIVE', 'LED 비상조명'),
(' CCTV 카메라', 13, 6, '입구/복도', '김철수', '2021-03-01', 1200000, 7, 'ACTIVE', 'HD 카메라 20 대'),
('액세서리 서버', 14, 1, '서버실', '이영희', '2017-09-10', 8000000, 5, 'REPLACEMENT_NEEDED', '구형 서버, 교체 필요'),
('네트워크 스위치', 15, 1, '서버실', '박민수', '2020-02-15', 1500000, 7, 'ACTIVE', '24 포트 기가비트'),
('무선 AP', 16, 1, '전체 구역', '김철수', '2021-06-01', 450000, 5, 'ACTIVE', 'Wi-Fi 6 지원'),
('프로젝터 EPSON', 17, 2, '회의실 A', '이영희', '2019-04-20', 900000, 7, 'ACTIVE', '비즈니스 프로젝터'),
('화이트보드 전자', 18, 2, '회의실 B', '박민수', '2020-09-10', 1200000, 10, 'ACTIVE', '터치스크린 방식'),
('책상 사무용', 19, 7, '본관', '김철수', '2018-01-15', 150000, 15, 'ACTIVE', '조절식 사무용 책상'),
('의자 사무용', 20, 7, '본관', '이영희', '2018-01-15', 80000, 10, 'ACTIVE', '에르고노믹 체어'),
('냉장고', 21, 2, '휴게실', '박민수', '2021-02-01', 500000, 10, 'ACTIVE', '2 도어 냉장고'),
('전자레인지', 22, 2, '휴게실', '김철수', '2020-05-15', 120000, 7, 'ACTIVE', '마이크로웨이브'),
('정수기', 23, 2, '본관 1 층', '이영희', '2019-03-10', 250000, 8, 'ACTIVE', '냉온정수기'),
('진단용 PC', 24, 1, '유지보수실', '박민수', '2018-11-20', 1100000, 5, 'INACTIVE', '고장으로 사용중단'),
('테스트 장비', 25, 8, '유지보수실', '김철수', '2020-07-01', 2200000, 7, 'ACTIVE', '멀티미터/오실로스코프');

-- 유지보수 이력 데이터
INSERT INTO `maintenance_record` (`asset_id`, `maintenance_date`, `maintenance_type`, `cost`, `description`, `technician`, `failure_type`) VALUES
(1, '2024-01-15', 'ROUTINE', 50000, '키보드 청소 및 소프트웨어 업데이트', '김기술', '없음'),
(1, '2024-06-20', 'REPAIR', 150000, '충전기 교체', '이수리', '충전기 고장'),
(1, '2025-02-10', 'REPAIR', 200000, '하드디스크 교체', '김기술', 'HDD 오류'),
(2, '2024-03-01', 'ROUTINE', 30000, '정기점검', '박정비', '없음'),
(3, '2023-08-15', 'REPAIR', 100000, '메인보드 수리', '이수리', '메인보드 고장'),
(3, '2024-01-20', 'REPAIR', 120000, '전원공급장치 교체', '김기술', '전원고장'),
(3, '2024-09-05', 'REPAIR', 80000, '팬 교체', '박정비', '냉각팬 소음'),
(4, '2024-02-10', 'ROUTINE', 20000, '토너 교체 및 청소', '김기술', '없음'),
(4, '2024-08-15', 'REPAIR', 80000, '프린트헤드 교체', '이수리', '인쇄불량'),
(5, '2024-04-01', 'ROUTINE', 200000, '정기점검 및 롤러 교체', '박정비', '없음'),
(5, '2025-01-10', 'REPAIR', 350000, '스캐너 유닛 수리', '김기술', '스캔오류'),
(6, '2024-05-15', 'ROUTINE', 80000, '에어컨 세척 및 냉매 충전', '이수리', '없음'),
(6, '2025-04-20', 'ROUTINE', 70000, '연간 정기점검', '박정비', '없음'),
(7, '2024-06-01', 'ROUTINE', 60000, '에어컨 세척', '김기술', '없음'),
(8, '2023-12-01', 'REPAIR', 300000, '배터리 점검', '이수리', '배터리 방전'),
(8, '2024-07-15', 'REPAIR', 450000, '인버터 수리', '박정비', '인버터 고장'),
(8, '2025-03-01', 'REPAIR', 200000, '배터리 교체', '김기술', '배터리 수명'),
(9, '2024-02-20', 'INSPECTION', 150000, '연간 안전점검', '이수리', '없음'),
(10, '2024-03-15', 'ROUTINE', 50000, '소화기 점검 및 충전', '박정비', '없음'),
(11, '2024-04-01', 'ROUTINE', 500000, '엘리베이터 정기점검', '김기술', '없음'),
(11, '2024-10-15', 'REPAIR', 800000, '도어 오프너 수리', '이수리', '도어고장'),
(13, '2024-05-01', 'ROUTINE', 100000, '카메라 점검 및 청소', '박정비', '없음'),
(13, '2025-01-20', 'REPAIR', 150000, '녹화장치 수리', '김기술', '녹화오류'),
(14, '2023-06-01', 'REPAIR', 500000, '하드디스크 교체', '이수리', 'HDD 오류'),
(14, '2024-02-15', 'REPAIR', 300000, '전원장치 교체', '박정비', '전원고장'),
(14, '2024-08-01', 'REPAIR', 400000, '메인보드 수리', '김기술', '메인보드 오류'),
(17, '2024-07-01', 'ROUTINE', 50000, '렌즈 청소 및 램프 점검', '이수리', '없음'),
(17, '2025-02-15', 'REPAIR', 200000, '램프 교체', '박정비', '램프 수명'),
(24, '2024-03-01', 'REPAIR', 300000, '메인보드 점검', '김기술', '부팅불량'),
(24, '2024-05-15', 'REPAIR', 250000, '그래픽카드 교체', '이수리', '화면오류');