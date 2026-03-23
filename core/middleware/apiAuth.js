// ============================================
// Neurvinial — API Authentication Middleware
// ============================================
// Protects API endpoints with API key authentication.
// API keys can be configured in environment variables.
//
// Usage:
//   const { requireApiKey } = require('./middleware/apiAuth');
//   app.post('/loans/request', requireApiKey, loanController.request);

const logger = require('../config/logger');

// ============================================
// API Key Storage
// ============================================
// In production, store these in a database with hashing.
// For hackathon demo, we use environment variables.

const VALID_API_KEYS = new Set();

// Load API keys from environment
function loadApiKeys() {
  const apiKeysEnv = process.env.API_KEYS || '';

  if (apiKeysEnv) {
    const keys = apiKeysEnv.split(',').map(k => k.trim()).filter(k => k);
    keys.forEach(key => VALID_API_KEYS.add(key));
    logger.info(`Loaded ${VALID_API_KEYS.size} API key(s) from environment`);
  }

  // Default demo key if none configured (for development only)
  if (VALID_API_KEYS.size === 0) {
    const defaultKey = 'sentinel_demo_key_2026';
    VALID_API_KEYS.add(defaultKey);
    logger.warn('No API keys configured. Using default demo key. DO NOT use in production!');
  }
}

// Initialize on module load
loadApiKeys();

// ============================================
// Middleware: Require API Key
// ============================================
/**
 * Middleware that checks for a valid API key in the request header.
 * Accepts API key in:
 *   - x-api-key header
 *   - Authorization: Bearer <key> header
 */
function requireApiKey(req, res, next) {
  // Extract API key from headers
  const apiKeyFromHeader = req.headers['x-api-key'];
  const authHeader = req.headers['authorization'];
  const apiKeyFromBearer = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : null;

  const apiKey = apiKeyFromHeader || apiKeyFromBearer;

  // Check if API key is provided
  if (!apiKey) {
    logger.warn('API request rejected: missing API key', {
      ip: req.ip,
      path: req.path,
      method: req.method
    });
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'API key required. Provide it in x-api-key header or Authorization: Bearer header.'
    });
  }

  // Validate API key
  if (!VALID_API_KEYS.has(apiKey)) {
    logger.warn('API request rejected: invalid API key', {
      ip: req.ip,
      path: req.path,
      method: req.method,
      keyPrefix: apiKey.substring(0, 8) + '...'
    });
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Invalid API key'
    });
  }

  // API key is valid — proceed
  logger.debug('API request authenticated', {
    path: req.path,
    method: req.method
  });

  // Attach API key info to request for logging
  req.apiKey = apiKey.substring(0, 12) + '...';

  next();
}

// ============================================
// Middleware: Optional API Key
// ============================================
/**
 * Middleware that checks for API key but doesn't reject if missing.
 * Useful for public endpoints that have API key-based rate limiting.
 */
function optionalApiKey(req, res, next) {
  const apiKeyFromHeader = req.headers['x-api-key'];
  const authHeader = req.headers['authorization'];
  const apiKeyFromBearer = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : null;

  const apiKey = apiKeyFromHeader || apiKeyFromBearer;

  if (apiKey && VALID_API_KEYS.has(apiKey)) {
    req.authenticated = true;
    req.apiKey = apiKey.substring(0, 12) + '...';
  } else {
    req.authenticated = false;
  }

  next();
}

// ============================================
// Helper: Add a new API key dynamically
// ============================================
function addApiKey(key) {
  if (!key || key.length < 16) {
    throw new Error('API key must be at least 16 characters');
  }
  VALID_API_KEYS.add(key);
  logger.info('API key added', { keyPrefix: key.substring(0, 8) + '...' });
}

// ============================================
// Helper: Generate a random API key
// ============================================
function generateApiKey() {
  const { randomBytes } = require('crypto');
  return `sentinel_${randomBytes(20).toString('hex')}`;
}

// Export middleware and helpers
module.exports = {
  requireApiKey,
  optionalApiKey,
  addApiKey,
  generateApiKey,
  loadApiKeys
};
