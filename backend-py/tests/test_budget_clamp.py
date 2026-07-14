"""_clamp_allocations_to_budget이 비례 축소 후 항목별 만원 단위 반올림을 거쳐도
총합이 반드시 total_budget 이하가 되도록 보장하는지 검증한다 (반올림이 이 함수
자체의 존재 이유인 "총합 <= 예산" 불변식을 깨뜨리지 않아야 한다)."""

from app.routers.ai import _clamp_allocations_to_budget
from app.schemas import CategoryAllocation


def _alloc(category: str, amount: float) -> CategoryAllocation:
    return CategoryAllocation(category=category, allocatedAmount=amount, ratio=0.0, reason="")


def test_clamp_keeps_sum_within_budget_even_after_rounding():
    # 140000/140000을 150000 예산에 맞춰 비례 축소하면 각각 75000이 되는데,
    # 만원 단위 반올림(round-half-to-even)을 거치면 80000/80000(합계 160000)이
    # 되어 예산(150000)을 다시 초과한다 — 이 재보정 없이는 실패하는 값이다.
    allocations = [
        _alloc("IT 장비", 140000),
        _alloc("사무기기", 140000),
    ]
    total_budget = 150000

    result = _clamp_allocations_to_budget(allocations, total_budget)

    assert sum(a.allocatedAmount for a in result) <= total_budget
    # 반올림 재보정 후에도 여전히 1만원 단위를 유지해야 한다.
    for a in result:
        assert a.allocatedAmount % 10000 == 0


def test_clamp_noop_when_already_within_budget():
    allocations = [_alloc("IT 장비", 100000), _alloc("사무기기", 50000)]
    result = _clamp_allocations_to_budget(allocations, 1000000)
    assert result[0].allocatedAmount == 100000
    assert result[1].allocatedAmount == 50000


def test_clamp_updates_ratio_to_match_final_amount():
    allocations = [_alloc("IT 장비", 900000), _alloc("사무기기", 900000)]
    total_budget = 1000000
    result = _clamp_allocations_to_budget(allocations, total_budget)
    for a in result:
        assert abs(a.ratio - a.allocatedAmount / total_budget) < 1e-9
