import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// 요청 인터셉터 - 로그인 토큰 자동 첨부
api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('auth_user');
  if (stored) {
    try {
      const { token } = JSON.parse(stored);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {
      // 손상된 값이면 무시
    }
  }
  return config;
});

// 응답 인터셉터 - 에러 처리 개선
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.status, error.message);

    // 토큰이 만료/무효화된 경우 (로그인 요청 자체의 401은 제외) 자동 로그아웃 후 로그인 페이지로 이동
    const isLoginRequest = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('auth_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    return Promise.reject(error);
  }
);

export const assetApi = {
  getAll: (params) => api.get('/assets', { params }),
  getById: (id) => api.get(`/assets/${id}`),
  create: (data) => api.post('/assets', data),
  update: (id, data) => api.put(`/assets/${id}`, data),
  delete: (id) => api.delete(`/assets/${id}`),
  getMaintenanceHistory: (id) => api.get(`/assets/${id}/maintenance`),
  updateMaintenanceRecord: (assetId, recordId, data) => api.put(`/assets/${assetId}/maintenance/${recordId}`, data),
  deleteMaintenanceRecord: (assetId, recordId) => api.delete(`/assets/${assetId}/maintenance/${recordId}`),
  getHistory: (id) => api.get(`/assets/${id}/history`),
};

export const aiApi = {
  naturalLanguageSearch: (query) => api.post('/ai/natural-language-search', { query }),
  getReplacementRecommendation: (budget) => api.post('/ai/replacement-recommendation', { budget }),
  getMaintenanceAnalysis: () => api.get('/ai/maintenance-analysis'),
  askQuestion: (question) => api.post('/qa/ask', { question }),
  getDashboardData: () => api.get('/dashboard'),
};

export const authApi = {
  login: (data) => api.post('/auth/login', data),
  register: (data) => api.post('/auth/register', data),
};

export const fileApi = {
  getAll: () => api.get('/files'),
  upload: (formData) => api.post('/files/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  process: (id) => api.post(`/files/${id}/process`),
  apply: (id) => api.post(`/files/${id}/apply`),
  delete: (id) => api.delete(`/files/${id}`),
};

export const reportApi = {
  getMonthly: () => api.get('/reports/monthly'),
  downloadPdf: () => api.get('/reports/monthly/pdf', { responseType: 'blob' }),
};

export const budgetApi = {
  getAll: () => api.get('/budgets'),
  set: (year, month, allocatedAmount) => api.put(`/budgets/${year}/${month}`, { allocatedAmount }),
  delete: (year, month) => api.delete(`/budgets/${year}/${month}`),
};