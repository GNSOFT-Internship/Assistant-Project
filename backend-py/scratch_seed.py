"""대량의 현실적인 자산 및 유지보수 이력 데이터를 생성하고 세이딩(Seeding)하는 스크립트.

총 150개의 자산과 약 250~300개의 유지보수 이력을 생성하여 DB에 적재합니다.
서버 RAM 200MB 안전 마진 내에서 원활히 돌아갈 수 있는 최적의 용량입니다.
"""

import os
import sys
from datetime import date, timedelta
import random

# 모듈 경로 추가
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.database import SessionLocal
from app import models

# 카테고리별 자산 정의 템플릿
TEMPLATES = {
    "IT 장비": [
        ("노트북 LG Gram 16", 1600000, 5),
        ("노트북 Samsung Galaxy Book4", 1800000, 5),
        ("노트북 Dell Latitude 5540", 1400000, 5),
        ("데스크톱 HP ProDesk 400", 900000, 5),
        ("데스크톱 Lenovo ThinkCentre Neo", 850000, 5),
        ("워크스테이션 Dell Precision 3660", 3500000, 5),
        ("서버 HPE ProLiant DL360 Gen11", 12000000, 6),
        ("서버 Dell PowerEdge R760", 14000000, 6),
        ("네트워크 스위치 Cisco Catalyst 9300", 4500000, 7),
        ("방화벽 Fortinet FortiGate 100F", 6000000, 7),
        ("무선 AP Aruba AP-515", 600000, 5),
        ("NAS 스토리지 Synology SA3400", 8000000, 6),
    ],
    "사무기기": [
        ("복합기 신도리코 D450", 3500000, 7),
        ("복사기 Canon imageRUNNER C3322", 2800000, 7),
        ("레이저 프린터 HP LaserJet M507", 750000, 5),
        ("빔 프로젝터 Epson EB-L530U", 2200000, 6),
        ("문서 세쇄기 대진코스탈 KS-9215", 1200000, 8),
        ("스마트 보드 맥스허브 75인치", 4800000, 7),
        ("얼음 정수기 청호나이스", 1500000, 5),
        ("커피머신 필립스 LatteGo", 900000, 5),
    ],
    "설비": [
        ("천장형 냉난방기 삼성 DVM S2", 4500000, 10),
        ("벽걸이 에어컨 LG 휘센", 800000, 8),
        ("중앙 공조기 신성엔지니어링", 25000000, 15),
        ("화물용 엘리베이터 현대엘리베이터", 35000000, 20),
        ("지하 보일러 경동나비엔", 18000000, 15),
        ("환기 장치 하츠", 1200000, 10),
    ],
    "전기설비": [
        ("비상 발전기 두산 250KW", 45000000, 15),
        ("무정전 전원장치(UPS) APC 10KVA", 6500000, 8),
        ("메인 수배전반 광명전기", 28000000, 15),
        ("동력 분전함 삼송전기", 3200000, 10),
        ("LED 비상 유도등 세오라이팅", 120000, 10),
    ],
    "안전설비": [
        ("수신반 지멘스 화재수신기", 7500000, 15),
        ("연기 감지기 호니웰", 45000, 10),
        ("열 감지기 호니웰", 35000, 10),
        ("가스 누출 경보기 신우전자", 150000, 8),
        ("분말 소화기 3.3kg 삼우", 30000, 10),
        ("이산화탄소 소화기 4.5kg", 180000, 10),
        ("완강기 구조 장비", 400000, 15),
    ],
    "보안장비": [
        ("CCTV 카메라 한화 테크윈 IP", 400000, 7),
        ("CCTV 녹화기(NVR) 한화 테크윈 32CH", 2500000, 7),
        ("지문인식 출입통제 슈프리마", 800000, 6),
        ("스피드게이트 에스원", 9000000, 10),
        ("금속 탐지기 가렛", 3500000, 10),
    ],
    "가구": [
        ("사무용 파티션 책상 세트 퍼시스", 450000, 15),
        ("인체공학 메시 의자 시디즈 T50", 350000, 10),
        ("임원용 우드 데스크 퍼시스", 1200000, 15),
        ("철제 캐비닛 현대리바트", 250000, 15),
        ("회의용 테이블 10인용", 800000, 15),
    ],
    "측정장비": [
        ("디지털 오실로스코프 텍트로닉스", 3800000, 7),
        ("디지털 멀티미터 키사이트", 1200000, 7),
        ("열화상 카메라 플리어 E54", 6500000, 8),
        ("진동 계측기 료비", 2400000, 7),
    ]
}

LOCATIONS = [
    "본관 1층 총무과", "본관 1층 로비", "본관 2층 기획실", "본관 2층 대회의실",
    "본관 3층 정보화본부", "본관 3층 서버실", "본관 지하 기계실", "본관 지하 전기실",
    "별관 1층 고객지원실", "별관 2층 세미나실", "외곽 주차장 및 정문", "각 층 계단실"
]

TECHNICIANS = ["김정비", "이기술", "박수리", "최엔지니어", "정기사", "강팀장", "조정비", "임기술"]

FAILURE_TYPES_BY_CATEGORY = {
    "IT 장비": ["HDD/SSD 오류", "메인보드 고장", "전원 불량", "OS 부팅 실패", "액정 파손", "네트워크 칩셋 불량"],
    "사무기기": ["용지 걸림", "급지 롤러 마모", "레이저 토너 모듈 불량", "램프 노후화", "필터 오염", "구동축 마모"],
    "설비": ["컴프레셔 압력 불량", "배관 냉매 누출", "와이어 마모", "보일러 버너 점화 불량", "팬 모터 소음", "온도 센서 오류"],
    "전기설비": ["배터리 셀 노후화", "배전반 차단기 트립", "콘덴서 누액", "발전기 시동 코일 손상", "케이블 단선"],
    "안전설비": ["소화약제 압력 저하", "감지기 오동작", "배터리 방전", "경보 스피커 단선", "완강기 지지대 균열"],
    "보안장비": ["카메라 렌즈 오염", "적외선 LED 불량", "NVR 디스크 배드섹터", "출입 게이트 모터 고장", "리더기 센서 불량"],
    "가구": ["쇼크업소버 실린더 압력 상실", "서랍 슬라이드 레일 이탈", "상판 도장 균열", "바퀴 이탈"],
    "측정장비": ["캘리브레이션 오차", "입력 프로브 파손", "액정 모듈 열화", "배터리 충전 불량"]
}

def seed_data():
    db = SessionLocal()
    try:
        # 기존 자산 및 유지보수 이력 비우기
        print("Cleaning up old database records...")
        db.query(models.MaintenanceRecord).delete()
        db.query(models.Asset).delete()
        db.commit()

        # 자산 150개 생성
        print("Generating 150 realistic assets...")
        assets = []
        asset_count = 150
        
        # 카테고리 골고루 분배 생성
        categories = list(TEMPLATES.keys())
        
        for i in range(1, asset_count + 1):
            category = categories[(i - 1) % len(categories)]
            template_list = TEMPLATES[category]
            name, base_price, useful_life = random.choice(template_list)
            
            asset_name = name
            asset_code = f"ASSET-{i:03d}"
            location = random.choice(LOCATIONS)
            responsible = f"{random.choice(['김', '이', '박', '최', '정', '강'])}{random.choice(['민수', '영희', '철수', '동현', '서연', '준우', '혜진'])}"
            
            # 최근 10년 이내 구매 날짜 생성
            purchase_years_ago = random.randint(0, 9)
            purchase_date = date.today() - timedelta(days=purchase_years_ago * 365 + random.randint(1, 360))
            
            # 가격 편차 10% 정도 부여
            price_variance = random.uniform(0.9, 1.1)
            purchase_price = round(base_price * price_variance, -4)  # 만원 단위 반올림
            
            # 내용연수와 비교한 사용기간 계산
            used_years = date.today().year - purchase_date.year
            
            # 상태값 설정 (사용기간이 내용연수를 넘었으면 REPLACEMENT_NEEDED 비율 상승)
            if used_years > useful_life:
                status_roll = random.random()
                if status_roll < 0.6:
                    status = models.AssetStatus.REPLACEMENT_NEEDED
                elif status_roll < 0.8:
                    status = models.AssetStatus.INACTIVE
                else:
                    status = models.AssetStatus.ACTIVE
            else:
                status_roll = random.random()
                if status_roll < 0.85:
                    status = models.AssetStatus.ACTIVE
                elif status_roll < 0.95:
                    status = models.AssetStatus.UNDER_MAINTENANCE
                else:
                    status = models.AssetStatus.REPLACEMENT_NEEDED

            asset = models.Asset(
                asset_name=asset_name,
                asset_code=asset_code,
                category=category,
                location=location,
                responsible_person=responsible,
                purchase_date=purchase_date,
                purchase_price=purchase_price,
                useful_life=useful_life,
                status=status,
                description=f"{category} 표준 자산 정보 관리 데이터"
            )
            db.add(asset)
            assets.append(asset)
        
        db.commit()
        print(f"Successfully seeded 150 assets.")

        # 유지보수 기록 약 250~300개 생성
        print("Generating realistic maintenance records...")
        records_count = 280
        created_records = 0

        # 자산 리스트 다시 쿼리 (DB가 생성한 PK ID 획득용)
        db_assets = db.query(models.Asset).all()

        for _ in range(records_count):
            asset = random.choice(db_assets)
            
            # 구매일 이후의 유지보수 날짜 선택
            days_since_purchase = (date.today() - asset.purchase_date).days
            if days_since_purchase < 30:
                continue  # 구매한 지 한 달도 안 된 장비는 점검 패스
                
            maint_days_after = random.randint(15, days_since_purchase - 5)
            maint_date = asset.purchase_date + timedelta(days=maint_days_after)
            
            # 유지보수 유형 결정
            maint_roll = random.random()
            if maint_roll < 0.45:
                maint_type = models.MaintenanceType.ROUTINE  # 정기점검
                cost = random.randint(30000, 150000)
                description = "정기 소모품 교체 및 클리닝 작업 수행"
                failure_type = "없음"
            elif maint_roll < 0.8:
                maint_type = models.MaintenanceType.REPAIR  # 수리
                cost = round(float(asset.purchase_price) * random.uniform(0.05, 0.25), -3)
                failure_type = random.choice(FAILURE_TYPES_BY_CATEGORY[asset.category])
                description = f"현장 점검 중 [{failure_type}] 현상 확인 후 긴급 파츠 수리 및 조정 조치"
            elif maint_roll < 0.95:
                maint_type = models.MaintenanceType.INSPECTION  # 긴급점검
                cost = random.randint(10000, 50000)
                description = "사용자 신고 접수 후 이상 유무 육안 점검 및 테스트"
                failure_type = "없음"
            else:
                maint_type = models.MaintenanceType.REPLACEMENT  # 교체
                cost = round(float(asset.purchase_price) * random.uniform(0.2, 0.5), -3)
                failure_type = random.choice(FAILURE_TYPES_BY_CATEGORY[asset.category])
                description = f"부품 노후화 및 고장 상태 심각하여 핵심 유닛 새 파츠로 완전 교체 진행"
            
            technician = random.choice(TECHNICIANS)

            record = models.MaintenanceRecord(
                asset_id=asset.id,
                maintenance_date=maint_date,
                maintenance_type=maint_type,
                cost=cost,
                description=description,
                technician=technician,
                failure_type=failure_type
            )
            db.add(record)
            created_records += 1

        db.commit()
        print(f"Successfully seeded {created_records} maintenance records.")
        print("Data Seeding complete!")
    except Exception as e:
        db.rollback()
        print(f"Seeding failed: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    seed_data()
