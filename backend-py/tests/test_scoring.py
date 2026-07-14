"""calc_used_years가 연도만 빼는 방식(오차 최대 1년)이 아니라 만 나이 방식으로
정확히 계산하는지 검증한다."""

from datetime import date

from app.scoring import calc_used_years


def test_calc_used_years_before_anniversary_this_year():
    # 2020-06-15 구매, 오늘이 2026-01-01 → 아직 생일 전이므로 만 5년(6년 아님)
    assert calc_used_years(date(2020, 6, 15), today=date(2026, 1, 1)) == 5


def test_calc_used_years_on_anniversary():
    assert calc_used_years(date(2020, 6, 15), today=date(2026, 6, 15)) == 6


def test_calc_used_years_after_anniversary():
    assert calc_used_years(date(2020, 6, 15), today=date(2026, 12, 31)) == 6


def test_calc_used_years_purchased_in_december_not_counted_as_year_old_on_jan_1():
    # 단순 연도 차감(today.year - purchase.year)이면 12월 30일 구매 자산이
    # 다음 해 1월 1일부터 "1년 사용"으로 잘못 집계된다. 실제로는 아직 2일밖에 안 지났으므로 0년이어야 한다.
    assert calc_used_years(date(2025, 12, 30), today=date(2026, 1, 1)) == 0


def test_calc_used_years_purchased_early_january_not_undercounted():
    assert calc_used_years(date(2020, 1, 2), today=date(2026, 1, 1)) == 5
    assert calc_used_years(date(2020, 1, 2), today=date(2026, 1, 2)) == 6


def test_calc_used_years_same_day_purchase_is_zero():
    assert calc_used_years(date(2026, 1, 1), today=date(2026, 1, 1)) == 0
