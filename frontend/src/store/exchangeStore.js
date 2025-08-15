import { create } from 'zustand';

/**
 * Exchange Store
 * Acts as a central hub for data exchange between modules
 * Each module can publish data to specific channels and subscribe to data from other modules
 */

export const useExchangeStore = create((set, get) => ({
  // Data channels
  channels: {
    buca: null,      // BUCA data
    jovie: null,     // JOVIE data
    uids: null,      // UID mappings
    storage: null    // Persistent storage
  },
  
  // Publish data to a channel
  publish: (channel, data) => {
    set(state => ({
      channels: {
        ...state.channels,
        [channel]: {
          ...state.channels[channel],
          ...data,
          timestamp: new Date().toISOString()
        }
      }
    }));
  },
  
  // Subscribe to data from a channel
  subscribe: (channel, selector = state => state) => {
    return (callback) => {
      const listener = (state) => {
        const data = state.channels[channel];
        if (data) {
          callback(selector(data), data);
        }
      };
      
      // Return unsubscribe function
      return useExchangeStore.subscribe(listener, selector);
    };
  },
  
  // Clear a channel
  clearChannel: (channel) => {
    set(state => ({
      channels: {
        ...state.channels,
        [channel]: null
      }
    }));
  },
  
  // Get current data from a channel
  getChannelData: (channel) => {
    return get().channels[channel];
  }
}));

// Initialize the store
if (typeof window !== 'undefined') {
  window.exchangeStore = useExchangeStore;
}
