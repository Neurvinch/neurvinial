// ============================================
// SENTINEL — Express Error Handler Middleware
// ============================================
// Must be the LAST middleware registered. Catches all unhandled errors
// and returns a consistent JSON response.

const logger = require('../config/logger');

function errorHandler(err, req, res, _next) {
  // Log the full error with stack trace
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Build response
  const response = {
    error: {
      message: err.message || 'Internal Server Error',
      code: err.code || 'INTERNAL_ERROR'
    }
  };

  // In development, include the stack trace
  if (process.env.NODE_ENV === 'development') {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

module.exports = errorHandler;
