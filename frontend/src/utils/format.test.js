import { describe, it, expect } from 'vitest';
import { formatPercent } from './format';

describe('formatPercent', () => {
  it('formats a normal percentage with one decimal place', () => {
    expect(formatPercent(45.678)).toBe('45.7%');
  });

  it('formats zero correctly', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('caps extreme values instead of printing absurd numbers', () => {
    // 배정 예산이 1원처럼 극단적으로 작을 때 실제 소진율이 수천만 %까지
    // 치솟는 사례가 있었다 (예: 500,000 / 1 * 100 = 50,000,000%).
    expect(formatPercent(50000000)).toBe('999%+');
  });

  it('does not cap a value exactly at the threshold', () => {
    expect(formatPercent(999)).toBe('999.0%');
  });

  it('returns a dash for null or NaN', () => {
    expect(formatPercent(null)).toBe('-');
    expect(formatPercent(undefined)).toBe('-');
    expect(formatPercent(NaN)).toBe('-');
  });

  it('respects a custom decimals option', () => {
    expect(formatPercent(45.678, { decimals: 0 })).toBe('46%');
  });
});
