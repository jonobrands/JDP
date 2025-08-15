import { create } from 'zustand';
import { auth, handleApiError } from '../utils/api';

const useAuthStore = create((set) => ({
  // Initial state
  user: null,
  token: localStorage.getItem('token') || null,
  isAuthenticated: !!localStorage.getItem('token'),
  isLoading: false,
  error: null,

  // Actions
  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const response = await auth.login(email, password);
      const { token, user } = response.data;
      
      // Store token in localStorage
      localStorage.setItem('token', token);
      
      set({
        user,
        token,
        isAuthenticated: true,
        isLoading: false,
      });
      
      return { success: true };
    } catch (error) {
      const { error: errorMessage } = handleApiError(error);
      set({ error: errorMessage, isLoading: false });
      return { success: false, error: errorMessage };
    }
  },

  register: async (userData) => {
    set({ isLoading: true, error: null });
    try {
      const response = await auth.register(userData);
      const { token, user } = response.data;
      
      // Store token in localStorage
      localStorage.setItem('token', token);
      
      set({
        user,
        token,
        isAuthenticated: true,
        isLoading: false,
      });
      
      return { success: true };
    } catch (error) {
      const { error: errorMessage } = handleApiError(error);
      set({ error: errorMessage, isLoading: false });
      return { success: false, error: errorMessage };
    }
  },

  logout: async () => {
    try {
      await auth.logout();
    } catch (error) {
      console.error('Error during logout:', error);
    } finally {
      // Clear token from localStorage
      localStorage.removeItem('token');
      
      // Reset state
      set({
        user: null,
        token: null,
        isAuthenticated: false,
      });
    }
  },

  checkAuth: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      return { isAuthenticated: false };
    }
    
    set({ isLoading: true });
    try {
      const response = await auth.getMe();
      set({
        user: response.data,
        isAuthenticated: true,
        isLoading: false,
      });
      return { isAuthenticated: true };
    } catch (error) {
      // If token is invalid, clear it
      localStorage.removeItem('token');
      set({
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
      });
      return { isAuthenticated: false };
    }
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
