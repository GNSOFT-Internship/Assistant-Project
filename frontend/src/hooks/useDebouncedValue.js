import { useEffect, useState } from 'react';

/** 값이 delay(ms) 동안 더 바뀌지 않을 때만 반영된 값을 반환한다.
 * 검색어 입력마다 서버 요청이 나가지 않도록 Assets/AuditLog 페이지에서 쓴다. */
export default function useDebouncedValue(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
