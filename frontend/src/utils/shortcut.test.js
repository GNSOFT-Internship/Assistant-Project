import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadShortcut,
  saveShortcut,
  clearShortcut,
  matchesShortcut,
  describeShortcut,
  isModifierOnly,
  captureShortcut,
} from './shortcut';

function keyEvent(overrides = {}) {
  return {
    key: 'k',
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  };
}

describe('shortcut storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when nothing is saved (meaning: use the default)', () => {
    expect(loadShortcut()).toBeNull();
  });

  it('round-trips a saved shortcut through localStorage', () => {
    const shortcut = { key: '/', ctrl: false, meta: false, alt: true, shift: false };
    saveShortcut(shortcut);
    expect(loadShortcut()).toEqual(shortcut);
  });

  it('clears the saved shortcut back to default', () => {
    saveShortcut({ key: 'p', ctrl: true, meta: false, alt: false, shift: true });
    clearShortcut();
    expect(loadShortcut()).toBeNull();
  });

  it('ignores corrupted localStorage content instead of throwing', () => {
    localStorage.setItem('cmdk_shortcut', 'not-json');
    expect(loadShortcut()).toBeNull();
  });
});

describe('matchesShortcut', () => {
  it('matches the default Ctrl/Cmd+K when no custom shortcut is set', () => {
    expect(matchesShortcut(keyEvent({ ctrlKey: true }), null)).toBe(true);
    expect(matchesShortcut(keyEvent({ metaKey: true }), null)).toBe(true);
  });

  it('does not match the default when Alt or Shift is also held', () => {
    expect(matchesShortcut(keyEvent({ ctrlKey: true, altKey: true }), null)).toBe(false);
    expect(matchesShortcut(keyEvent({ ctrlKey: true, shiftKey: true }), null)).toBe(false);
  });

  it('does not match a plain K with no modifier', () => {
    expect(matchesShortcut(keyEvent(), null)).toBe(false);
  });

  it('matches a custom shortcut exactly as recorded', () => {
    const custom = { key: '/', ctrl: false, meta: false, alt: true, shift: false };
    expect(matchesShortcut(keyEvent({ key: '/', altKey: true }), custom)).toBe(true);
    expect(matchesShortcut(keyEvent({ key: '/', altKey: true, shiftKey: true }), custom)).toBe(false);
  });

  it('is case-insensitive on the key', () => {
    const custom = { key: 'k', ctrl: true, meta: false, alt: false, shift: false };
    expect(matchesShortcut(keyEvent({ key: 'K', ctrlKey: true }), custom)).toBe(true);
  });
});

describe('describeShortcut', () => {
  it('describes a custom shortcut with Ctrl+Shift', () => {
    expect(describeShortcut({ key: 'p', ctrl: true, meta: false, alt: false, shift: true })).toBe('Ctrl+Shift+P');
  });

  it('uppercases single-character keys but leaves longer key names alone', () => {
    expect(describeShortcut({ key: 'Escape', ctrl: true, meta: false, alt: false, shift: false })).toContain('Escape');
  });
});

describe('isModifierOnly / captureShortcut', () => {
  it('treats bare modifier keys as not-yet-a-complete-shortcut', () => {
    expect(isModifierOnly(keyEvent({ key: 'Control' }))).toBe(true);
    expect(isModifierOnly(keyEvent({ key: 'Shift' }))).toBe(true);
    expect(isModifierOnly(keyEvent({ key: 'k' }))).toBe(false);
  });

  it('captures the exact modifier combination pressed', () => {
    const e = keyEvent({ key: 'p', ctrlKey: true, shiftKey: true });
    expect(captureShortcut(e)).toEqual({ key: 'p', ctrl: true, meta: false, alt: false, shift: true });
  });
});
