const Redis = require('ioredis');
require('dotenv').config();

let redis;
let useInMemory = false;
const inMemoryStore = new Map();

// Only initialize Redis if explicitly enabled in environment
if (process.env.USE_REDIS === 'true') {
  try {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    
    redis.on('connect', () => {
      console.log('Connected to Redis');
    });

    redis.on('error', (err) => {
      console.error('Redis error, falling back to in-memory store:', err);
      useInMemory = true;
    });
  } catch (err) {
    console.error('Failed to initialize Redis, using in-memory store:', err);
    useInMemory = true;
  }
} else {
  console.log('Redis disabled, using in-memory store');
  useInMemory = true;
}

// In-memory store implementation
const inMemorySet = (key, value, ttl = null) => {
  const data = { value, expires: ttl ? Date.now() + (ttl * 1000) : null };
  inMemoryStore.set(key, data);
  return Promise.resolve('OK');
};

const inMemoryGet = async (key) => {
  const data = inMemoryStore.get(key);
  if (!data) return null;
  
  if (data.expires && Date.now() > data.expires) {
    inMemoryStore.delete(key);
    return null;
  }
  
  return JSON.stringify(data.value);
};

// Helper functions with fallback to in-memory
const setWithExpiry = async (key, value, ttl = null) => {
  const stringValue = JSON.stringify(value);
  if (!useInMemory) {
    if (ttl) {
      return redis.set(key, stringValue, 'EX', ttl);
    }
    return redis.set(key, stringValue);
  }
  return inMemorySet(key, value, ttl);
};

const getWithParse = async (key) => {
  let data;
  if (!useInMemory) {
    data = await redis.get(key);
  } else {
    data = await inMemoryGet(key);
  }
  return data ? JSON.parse(data) : null;
};

// Export the appropriate client
const redisClient = useInMemory ? null : redis;

module.exports = {
  redis: redisClient,
  setWithExpiry,
  getWithParse,
  isUsingInMemory: () => useInMemory,
};
