"""기존에 시딩된 자산명 끝의 ' (#12)' 같은 일련번호 접미사를 제거하는 1회성 스크립트."""
import re

from app.database import SessionLocal
from app import models

SUFFIX_RE = re.compile(r"\s*\(#\d+\)\s*$")


def main():
    db = SessionLocal()
    try:
        assets = db.query(models.Asset).all()
        updated = 0
        for a in assets:
            new_name = SUFFIX_RE.sub("", a.asset_name)
            if new_name != a.asset_name:
                a.asset_name = new_name
                updated += 1
        db.commit()
        print(f"업데이트된 자산 수: {updated} / 전체 {len(assets)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
