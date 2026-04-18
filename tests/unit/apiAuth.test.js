// ============================================
// SENTINEL — Unit Tests: API Authentication
// ============================================

const { requireApiKey, optionalApiKey, generateApiKey, addApiKey } = require('../../core/middleware/apiAuth');

describe('API Authentication Middleware', () => {
  describe('generateApiKey', () => {
    test('generates a valid API key', () => {
      const key = generateApiKey();
      expect(key).toMatch(/^sentinel_[a-f0-9]{40}$/);
    });

    test('generates unique keys', () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('requireApiKey middleware', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        headers: {},
        ip: '127.0.0.1',
        path: '/test',
        method: 'POST'
      };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      next = jest.fn();

      // Add the default demo key for testing
      process.env.API_KEYS = 'sentinel_demo_key_2026';
      require('../../core/middleware/apiAuth').loadApiKeys();
    });

    test('accepts valid API key in x-api-key header', () => {
      req.headers['x-api-key'] = 'sentinel_demo_key_2026';
      requireApiKey(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('accepts valid API key in Authorization header', () => {
      req.headers['authorization'] = 'Bearer sentinel_demo_key_2026';
      requireApiKey(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    test('rejects request with missing API key', () => {
      requireApiKey(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });

    test('rejects request with invalid API key', () => {
      req.headers['x-api-key'] = 'invalid_key';
      requireApiKey(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Forbidden'
        })
      );
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('optionalApiKey middleware', () => {
    let req, res, next;

    beforeEach(() => {
      req = {
        headers: {},
        ip: '127.0.0.1',
        path: '/test',
        method: 'GET'
      };
      res = {};
      next = jest.fn();
    });

    test('sets authenticated=true for valid key', () => {
      req.headers['x-api-key'] = 'sentinel_demo_key_2026';
      optionalApiKey(req, res, next);
      expect(req.authenticated).toBe(true);
      expect(next).toHaveBeenCalled();
    });

    test('sets authenticated=false for missing key', () => {
      optionalApiKey(req, res, next);
      expect(req.authenticated).toBe(false);
      expect(next).toHaveBeenCalled();
    });

    test('sets authenticated=false for invalid key', () => {
      req.headers['x-api-key'] = 'invalid';
      optionalApiKey(req, res, next);
      expect(req.authenticated).toBe(false);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('addApiKey', () => {
    test('adds a new API key', () => {
      const newKey = generateApiKey();
      expect(() => addApiKey(newKey)).not.toThrow();
    });

    test('rejects short API keys', () => {
      expect(() => addApiKey('short')).toThrow('API key must be at least 16 characters');
    });
  });
});
