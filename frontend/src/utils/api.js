import axios from 'axios';

// Create axios instance with base URL and default headers
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to add auth token to requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle common errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle session expiration
    if (error.response?.status === 401) {
      // Clear token and redirect to login
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const auth = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (userData) => api.post('/auth/register', userData),
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
};

// Cases API
export const cases = {
  getAll: (params) => api.get('/cases', { params }),
  getById: (id) => api.get(`/cases/${id}`),
  create: (caseData) => api.post('/cases', caseData),
  update: (id, caseData) => api.put(`/cases/${id}`, caseData),
  delete: (id) => api.delete(`/cases/${id}`),
};

// Sessions API
export const sessions = {
  getAll: () => api.get('/sessions'),
  revoke: (id) => api.delete(`/sessions/${id}`),
  revokeAll: () => api.delete('/sessions/me/all'),
};

// Helper function to handle API errors
export const handleApiError = (error) => {
  if (error.response) {
    // The request was made and the server responded with a status code
    // that falls out of the range of 2xx
    const { data, status, headers } = error.response;
    console.error('API Error:', { data, status, headers });
    return {
      error: data.message || 'An error occurred',
      status,
      validationErrors: data.errors,
    };
  } else if (error.request) {
    // The request was made but no response was received
    console.error('API Error: No response received', error.request);
    return { error: 'No response from server. Please check your connection.' };
  } else {
    // Something happened in setting up the request that triggered an Error
    console.error('API Error:', error.message);
    return { error: error.message };
  }
};

export default api;
