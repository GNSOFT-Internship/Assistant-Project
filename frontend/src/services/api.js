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
  exportExcel: (params) => api.get('/assets/export', { params, responseType: 'blob' }),
  getById: (id) => api.get(`/assets/${id}`),
  create: (data) => api.post('/assets', data),
  update: (id, data) => api.put(`/assets/${id}`, data),
  delete: (id) => api.delete(`/assets/${id}`),
  getMaintenanceHistory: (id) => api.get(`/assets/${id}/maintenance`),
  updateMaintenanceRecord: (assetId, recordId, data) => api.put(`/assets/${assetId}/maintenance/${recordId}`, data),
  deleteMaintenanceRecord: (assetId, recordId) => api.delete(`/assets/${assetId}/maintenance/${recordId}`),
  getHistory: (id) => api.get(`/assets/${id}/history`),
};

// LLM 응답(GLM-5.2)은 수십 초가 걸릴 수 있어, AI 서술을 실제로 호출하는
// 요청은 기본 타임아웃(30초)보다 훨씬 넉넉하게 잡는다.
const AI_TIMEOUT = 150000;

export const aiApi = {
  naturalLanguageSearch: (query) => api.post('/ai/natural-language-search', { query }, { timeout: AI_TIMEOUT }),
  getReplacementRecommendation: (budget) => api.post('/ai/replacement-recommendation', { budget }, { timeout: AI_TIMEOUT }),
  getMaintenanceAnalysis: (params) => api.get('/ai/maintenance-analysis', { params, timeout: AI_TIMEOUT }),
  getAssetsByFailureType: (failureType, params) => api.get('/ai/maintenance-analysis/failure-assets', { params: { failureType, ...params } }),
  askQuestion: (question) => api.post('/qa/ask', { question }, { timeout: AI_TIMEOUT }),
  getDashboardData: () => api.get('/dashboard'),
  getWorkOrder: (recordId) => api.get(`/ai/work-orders/${recordId}`, { timeout: AI_TIMEOUT }),
  getBudgetForecast: () => api.get('/ai/budgets/forecast', { timeout: AI_TIMEOUT }),
  simulateBudget: (totalBudget) => api.post('/ai/budgets/simulate', { totalBudget }, { timeout: AI_TIMEOUT }),
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
  batchUpload: (formData) => api.post('/files/batch-upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120000,
  }),
  process: (id) => api.post(`/files/${id}/process`),
  apply: (id) => api.post(`/files/${id}/apply`),
  batchApply: (fileIds) => api.post('/files/batch-apply', { fileIds }),
  unapply: (id) => api.post(`/files/${id}/unapply`),
  delete: (id) => api.delete(`/files/${id}`),
};

export const chatApi = {
  getHistory: () => api.get('/chat/history'),
  clearHistory: () => api.delete('/chat/history'),
};

export const reportApi = {
  getMonthly: (params) => api.get('/reports/monthly', { params, timeout: params?.includeAi ? AI_TIMEOUT : undefined }),
  downloadPdf: () => api.get('/reports/monthly/pdf', { responseType: 'blob', timeout: AI_TIMEOUT }),
};

export const budgetApi = {
  getAll: () => api.get('/budgets'),
  set: (year, month, allocatedAmount) => api.put(`/budgets/${year}/${month}`, { allocatedAmount }),
  delete: (year, month) => api.delete(`/budgets/${year}/${month}`),
};