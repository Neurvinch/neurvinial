// ============================================
// Neurvinial — Request Validation Middleware Factory
// ============================================
// Takes a Joi schema, returns Express middleware that validates req.body.
// Usage: router.post('/loans/request', validateRequest(loanRequestSchema), handler);

function validateRequest(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,     // Report ALL errors, not just the first
      stripUnknown: true     // Remove fields not in the schema
    });

    if (error) {
      const messages = error.details.map(d => d.message);
      return res.status(400).json({
        error: {
          message: 'Validation failed',
          code: 'VALIDATION_ERROR',
          details: messages
        }
      });
    }

    // Replace req.body with the validated + sanitized value
    req.body = value;
    next();
  };
}

module.exports = validateRequest;
