const STORAGE_KEY = 'cmdk_shortcut';

const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform);

const MODIFIER_KEYS = ['control', 'meta', 'alt', 'shift'];

export function getDefaultShortcutLabel() {
  return isMac ? '⌘K' : 'Ctrl+K';
}

export function loadShortcut() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null; // null = 기본값(Ctrl 또는 ⌘ + K) 사용
  } catch {
    return null;
  }
}

export function saveShortcut(shortcut) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcut));
}

export function clearShortcut() {
  localStorage.removeItem(STORAGE_KEY);
}

// 기본값은 Mac/Windows 모두에서 자연스럽게 쓰도록 Ctrl 또는 ⌘ 중 하나만 눌러도 동작하고,
// 사용자가 직접 등록한 단축키는 눌렀던 조합을 그대로 정확히 매칭한다.
export function matchesShortcut(e, shortcut) {
  if (!shortcut) {
    return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k';
  }
  return (
    e.key.toLowerCase() === shortcut.key.toLowerCase() &&
    e.ctrlKey === shortcut.ctrl &&
    e.metaKey === shortcut.meta &&
    e.altKey === shortcut.alt &&
    e.shiftKey === shortcut.shift
  );
}

export function describeShortcut(shortcut) {
  if (!shortcut) return getDefaultShortcutLabel();
  const parts = [];
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.meta) parts.push(isMac ? '⌘' : 'Meta');
  if (shortcut.alt) parts.push(isMac ? '⌥' : 'Alt');
  if (shortcut.shift) parts.push('Shift');
  const keyLabel = shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key;
  parts.push(keyLabel);
  return parts.join('+');
}

export function isModifierOnly(e) {
  return MODIFIER_KEYS.includes(e.key.toLowerCase());
}

export function captureShortcut(e) {
  return {
    key: e.key,
    ctrl: e.ctrlKey,
    meta: e.metaKey,
    alt: e.altKey,
    shift: e.shiftKey,
  };
}
