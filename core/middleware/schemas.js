// ============================================
// SENTINEL — Request Validation Schemas
// ============================================
// Joi schemas for validating incoming API requests.
// Used with validateRequest middleware.

const Joi = require('joi');

// ============================================
// Agent Registration
// ============================================
const agentRegisterSchema = Joi.object({
  did: Joi.string()
    .required()
    .pattern(/^did:[a-z0-9]+:/, 'DID format')
    .messages({
      'string.pattern.name': 'DID must follow W3C format (e.g., did:ethr:0x...)',
      'any.required': 'DID is required'
    })
});

// ============================================
// Loan Request
// ============================================
const loanRequestSchema = Joi.object({
  did: Joi.string()
    .required()
    .pattern(/^did:[a-z0-9]+:/i)
    .messages({
      'string.pattern.base': 'DID must follow W3C format',
      'any.required': 'DID is required'
    }),

  amount: Joi.number()
    .required()
    .min(1)
    .max(100000)
    .messages({
      'number.base': 'Amount must be a number',
      'number.min': 'Amount must be at least 1 USDT',
      'number.max': 'Amount cannot exceed 100,000 USDT',
      'any.required': 'Amount is required'
    }),

  purpose: Joi.string()
    .optional()
    .max(500)
    .messages({
      'string.max': 'Purpose must be 500 characters or less'
    })
});

// ============================================
// Loan Disbursement
// ============================================
const loanDisburseSchema = Joi.object({
  loanId: Joi.string()
    .required()
    .uuid()
    .messages({
      'string.guid': 'Loan ID must be a valid UUID',
      'any.required': 'Loan ID is required'
    })
});

// ============================================
// Loan Repayment
// ============================================
const loanRepaymentSchema = Joi.object({
  loanId: Joi.string()
    .required()
    .uuid()
    .messages({
      'string.guid': 'Loan ID must be a valid UUID',
      'any.required': 'Loan ID is required'
    }),

  repaymentTxHash: Joi.string()
    .optional()
    .pattern(/^0x[a-fA-F0-9]{64}$/)
    .messages({
      'string.pattern.base': 'Transaction hash must be a valid Ethereum txn hash (0x...)'
    })
});

// ============================================
// Query Parameters Schemas
// ============================================
const loanQuerySchema = Joi.object({
  loanId: Joi.string()
    .uuid()
    .messages({
      'string.guid': 'Loan ID must be a valid UUID'
    })
});

const didQuerySchema = Joi.object({
  did: Joi.string()
    .pattern(/^did:[a-z0-9]+:/i)
    .messages({
      'string.pattern.base': 'DID must follow W3C format'
    })
});

// ============================================
// Capital Management
// ============================================
const capitalDeploySchema = Joi.object({
  protocol: Joi.string()
    .required()
    .valid('aave', 'compound', 'yearn')
    .messages({
      'any.only': 'Protocol must be one of: aave, compound, yearn',
      'any.required': 'Protocol is required'
    }),

  amount: Joi.number()
    .required()
    .min(100)
    .messages({
      'number.min': 'Minimum deployment amount is 100 USDT',
      'any.required': 'Amount is required'
    })
});

// ============================================
// Agent-to-Agent Lending
// ============================================
const agentLoanRequestSchema = Joi.object({
  borrowerDid: Joi.string()
    .required()
    .pattern(/^did:[a-z0-9]+:/i)
    .messages({
      'string.pattern.base': 'Borrower DID must follow W3C format',
      'any.required': 'Borrower DID is required'
    }),

  lenderDid: Joi.string()
    .required()
    .pattern(/^did:[a-z0-9]+:/i)
    .messages({
      'string.pattern.base': 'Lender DID must follow W3C format',
      'any.required': 'Lender DID is required'
    }),

  amount: Joi.number()
    .required()
    .min(1)
    .max(100000)
    .messages({
      'number.min': 'Amount must be at least 1 USDT',
      'number.max': 'Amount cannot exceed 100,000 USDT',
      'any.required': 'Amount is required'
    }),

  interestRate: Joi.number()
    .optional()
    .min(0)
    .max(100)
    .messages({
      'number.min': 'Interest rate cannot be negative',
      'number.max': 'Interest rate cannot exceed 100%'
    })
});

// Export all schemas
module.exports = {
  agentRegisterSchema,
  loanRequestSchema,
  loanDisburseSchema,
  loanRepaymentSchema,
  loanQuerySchema,
  didQuerySchema,
  capitalDeploySchema,
  agentLoanRequestSchema
};
