import { describe, it, expect, beforeEach, vi } from 'vitest';

// axios.create()가 반환하는 인스턴스를 흉내 내서, api.js가 등록하는 요청/응답
// 인터셉터 콜백을 그대로 붙잡아둔다. 실제 네트워크 호출 없이 인터셉터 로직만
// 단위 테스트하기 위함이다 (F8 - 토큰 첨부/401 자동 로그아웃은 보안에 직결되는
// 로직인데 지금까지 테스트가 전혀 없었다).
let requestInterceptor;
let responseErrorInterceptor;

vi.mock('axios', () => {
  const instance = {
    interceptors: {
      request: { use: (fn) => { requestInterceptor = fn; } },
      response: { use: (_onFulfilled, onRejected) => { responseErrorInterceptor = onRejected; } },
    },
  };
  return { default: { create: () => instance } };
});

beforeEach(async () => {
  localStorage.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await import('./api.js');
});

describe('요청 인터셉터 - 토큰 자동 첨부', () => {
  it('localStorage에 저장된 토큰을 Authorization 헤더로 붙인다', () => {
    localStorage.setItem('auth_user', JSON.stringify({ token: 'abc123', username: 'admin', role: 'ADMIN' }));
    const config = requestInterceptor({ headers: {} });
    expect(config.headers.Authorization).toBe('Bearer abc123');
  });

  it('로그인 정보가 없으면 헤더를 붙이지 않는다', () => {
    const config = requestInterceptor({ headers: {} });
    expect(config.headers.Authorization).toBeUndefined();
  });

  it('localStorage 값이 손상된 JSON이어도 예외 없이 그냥 통과시킨다', () => {
    localStorage.setItem('auth_user', '{이건 JSON이 아님');
    expect(() => requestInterceptor({ headers: {} })).not.toThrow();
    const config = requestInterceptor({ headers: {} });
    expect(config.headers.Authorization).toBeUndefined();
  });
});

describe('응답 인터셉터 - 401 자동 로그아웃', () => {
  it('로그인 요청이 아닌 401은 저장된 로그인 정보를 지운다', async () => {
    localStorage.setItem('auth_user', JSON.stringify({ token: 'abc123' }));
    const error = { response: { status: 401 }, config: { url: '/api/assets' }, message: 'Unauthorized' };

    await expect(responseErrorInterceptor(error)).rejects.toBe(error);
    expect(localStorage.getItem('auth_user')).toBeNull();
  });

  it('로그인 요청 자체의 401(아이디/비밀번호 오류)은 로그인 정보를 지우지 않는다', async () => {
    localStorage.setItem('auth_user', JSON.stringify({ token: 'stale-token' }));
    const error = { response: { status: 401 }, config: { url: '/api/auth/login' }, message: 'Unauthorized' };

    await expect(responseErrorInterceptor(error)).rejects.toBe(error);
    expect(localStorage.getItem('auth_user')).not.toBeNull();
  });

  it('401이 아닌 에러는 로그인 정보를 건드리지 않고 그대로 reject한다', async () => {
    localStorage.setItem('auth_user', JSON.stringify({ token: 'abc123' }));
    const error = { response: { status: 500 }, config: { url: '/api/assets' }, message: 'Server Error' };

    await expect(responseErrorInterceptor(error)).rejects.toBe(error);
    expect(localStorage.getItem('auth_user')).not.toBeNull();
  });
});
