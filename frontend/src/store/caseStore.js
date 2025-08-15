import { create } from 'zustand';
import { cases, handleApiError } from '../utils/api';

const useCaseStore = create((set, get) => ({
  // State
  cases: [],
  currentCase: null,
  isLoading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 1,
  },
  filters: {
    status: '',
    search: '',
  },

  // Actions
  setFilters: (filters) => set({ filters: { ...get().filters, ...filters } }),
  setPagination: (pagination) => set({ pagination: { ...get().pagination, ...pagination } }),

  // Fetch all cases with pagination and filters
  fetchCases: async (params = {}) => {
    set({ isLoading: true, error: null });
    
    // Merge default pagination and filters with provided params
    const { page, limit, ...filters } = {
      page: get().pagination.page,
      limit: get().pagination.limit,
      ...get().filters,
      ...params,
    };

    try {
      const response = await cases.getAll({
        page,
        limit,
        ...filters,
      });

      const { data, pagination } = response.data;
      
      set({
        cases: data,
        pagination: {
          page: parseInt(pagination.page),
          limit: parseInt(pagination.limit),
          total: parseInt(pagination.total),
          totalPages: Math.ceil(parseInt(pagination.total) / parseInt(pagination.limit)),
        },
        isLoading: false,
      });
      
      return { success: true };
    } catch (error) {
      const { error: errorMessage } = handleApiError(error);
      set({ error: errorMessage, isLoading: false });
      return { success: false, error: errorMessage };
    }
  },

  // Fetch a single case by ID
  fetchCaseById: async (id) => {
    set({ isLoading: true, error: null });
    
    try {
      const response = await cases.getById(id);
      set({ currentCase: response.data, isLoading: false });
      return { success: true, data: response.data };
    } catch (error) {
      const { error: errorMessage } = handleApiError(error);
      set({ error: errorMessage, isLoading: false });
      return { success: false, error: errorMessage };
    }
  },

  // Create a new case
  createCase: async (caseData) => {
    set({ isLoading: true, error: null });
    
    try {
      const response = await cases.create(caseData);
      
      // Add the new case to the beginning of the cases array
      set((state) => ({
        cases: [response.data, ...state.cases],
        isLoading: false,
      }));
      
      return { success: true, data: response.data };
    } catch (error) {
      const { error: errorMessage, validationErrors } = handleApiError(error);
      set({ error: errorMessage, isLoading: false });
      return { 
        success: false, 
        error: errorMessage,
        validationErrors,
      };
    }
  },

  // Update an existing case
  updateCase: async (id, caseData) => {
    set({ isLoading: true, error: null });
    
    try {
      const response = await cases.update(id, caseData);
      
      // Update the case in the cases array
      set((state) => ({
        cases: state.cases.map((c) => 
          c.id === id ? { ...c, ...response.data } : c
        ),
        currentCase: response.data,
        isLoading: false,
      }));
      
      return { success: true, data: response.data };
    } catch (error) {
      const { error: errorMessage, validationErrors } = handleApiError(error);
      set({ error: errorMessage, isLoading: false });
      return { 
        success: false, 
        error: errorMessage,
        validationErrors,
      };
    }
  },

  // Delete a case
  deleteCase: async (id) => {
    set({ isLoading: true, error: null });
    
    try {
      await cases.delete(id);
      
      // Remove the case from the cases array
      set((state) => ({
        cases: state.cases.filter((c) => c.id !== id),
        // Clear currentCase if it's the one being deleted
        currentCase: state.currentCase?.id === id ? null : state.currentCase,
        isLoading: false,
      }));
      
      return { success: true };
    } catch (error) {
      const { error: errorMessage } = handleApiError(error);
      set({ error: errorMessage, isLoading: false });
      return { success: false, error: errorMessage };
    }
  },

  // Clear the current case
  clearCurrentCase: () => set({ currentCase: null }),
  
  // Clear any error
  clearError: () => set({ error: null }),
}));

export default useCaseStore;
