import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// 응답 인터셉터 - 에러 처리 개선
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.status, error.message);
    return Promise.reject(error);
  }
);

export const assetApi = {
  getAll: () => api.get('/assets'),
  getById: (id) => api.get(`/assets/${id}`),
  create: (data) => api.post('/assets', data),
  update: (id, data) => api.put(`/assets/${id}`, data),
  delete: (id) => api.delete(`/assets/${id}`),
  search: (criteria) => api.post('/assets/search', criteria),
  getMaintenanceHistory: (id) => api.get(`/assets/${id}/maintenance`),
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
  generate: () => api.get('/reports/generate', { responseType: 'blob' }),
};