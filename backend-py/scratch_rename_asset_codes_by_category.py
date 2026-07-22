"""자산번호(assetCode)를 카테고리별로 구분되게 일괄 변경하는 1회성 마이그레이션 스크립트.

지금까지는 카테고리와 무관하게 "ASSET-001" 식으로 순차 번호만 매겨져 있어서,
자산번호만 보고는 어떤 카테고리 장비인지 알 수 없었다. 카테고리별 접두사 +
그 카테고리 안에서의 순번으로 다시 매긴다 (예: IT-001, FUR-002).

감사로그(asset_audit_log)의 asset_code 스냅샷과 changes JSON 안의 assetCode
diff도 함께 새 번호로 갱신한다 — 통상적으로는 "그 시점의 기록"을 보존해야
하지만, 이번은 순수 넘버링 체계 개정이라 예외적으로 과거 기록도 새 번호로
맞추기로 사용자와 확정했다.

실행 전에 asset/asset_audit_log 테이블을 백업해두는 것을 권장한다.
"""
import json
import sys

from app.database import SessionLocal
from app import models

PREFIX_BY_CATEGORY = {
    "IT 장비": "IT",
    "사무기기": "OFF",
    "설비": "FAC",
    "전기설비": "ELEC",
    "안전설비": "SAFE",
    "보안장비": "SEC",
    "가구": "FUR",
    "측정장비": "MEAS",
}


def main():
    db = SessionLocal()
    try:
        assets = (
            db.query(models.Asset)
            .order_by(models.Asset.category, models.Asset.id)
            .all()
        )

        old_to_new = {}
        counters = {}
        for asset in assets:
            prefix = PREFIX_BY_CATEGORY.get(asset.category)
            if prefix is None:
                print(f"[SKIP] id={asset.id} code={asset.asset_code} 알 수 없는 카테고리 '{asset.category}'")
                continue
            counters[prefix] = counters.get(prefix, 0) + 1
            new_code = f"{prefix}-{counters[prefix]:03d}"
            old_to_new[asset.asset_code] = new_code
            print(f"{asset.asset_code} -> {new_code}  ({asset.category}, id={asset.id})")
            asset.asset_code = new_code

        logs = db.query(models.AssetAuditLog).all()
        updated_log_columns = 0
        updated_log_json = 0
        for log in logs:
            if log.asset_code in old_to_new:
                log.asset_code = old_to_new[log.asset_code]
                updated_log_columns += 1

            if not log.changes:
                continue
            try:
                changes = json.loads(log.changes)
            except (TypeError, ValueError):
                continue
            asset_code_diff = changes.get("assetCode")
            if not isinstance(asset_code_diff, dict):
                continue
            changed = False
            for key in ("old", "new"):
                value = asset_code_diff.get(key)
                if value in old_to_new:
                    asset_code_diff[key] = old_to_new[value]
                    changed = True
            if changed:
                log.changes = json.dumps(changes, ensure_ascii=False)
                updated_log_json += 1

        if "--commit" in sys.argv:
            db.commit()
            print(
                f"\n[커밋됨] 자산 {len(old_to_new)}건, 감사로그 컬럼 {updated_log_columns}건, "
                f"감사로그 changes JSON {updated_log_json}건 갱신 완료"
            )
        else:
            db.rollback()
            print(
                f"\n[DRY RUN — 실제로 저장되지 않음] 자산 {len(old_to_new)}건, "
                f"감사로그 컬럼 {updated_log_columns}건, 감사로그 changes JSON {updated_log_json}건 "
                f"변경될 예정. 실제로 적용하려면 --commit 옵션을 붙여서 다시 실행."
            )
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
