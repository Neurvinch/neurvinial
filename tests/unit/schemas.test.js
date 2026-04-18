// ============================================
// SENTINEL — Unit Tests: Request Validation Schemas
// ============================================

const {
  agentRegisterSchema,
  loanRequestSchema,
  loanRepaymentSchema,
  capitalDeploySchema,
  agentLoanRequestSchema
} = require('../../core/middleware/schemas');

describe('Request Validation Schemas', () => {
  describe('agentRegisterSchema', () => {
    test('accepts valid DID', () => {
      const result = agentRegisterSchema.validate({
        did: 'did:ethr:0x1234567890abcdef'
      });
      expect(result.error).toBeUndefined();
    });

    test('rejects missing DID', () => {
      const result = agentRegisterSchema.validate({});
      expect(result.error).toBeDefined();
      expect(result.error.message).toMatch(/required/i);
    });

    test('rejects invalid DID format', () => {
      const result = agentRegisterSchema.validate({
        did: 'not-a-valid-did'
      });
      expect(result.error).toBeDefined();
    });
  });

  describe('loanRequestSchema', () => {
    test('accepts valid loan request', () => {
      const result = loanRequestSchema.validate({
        did: 'did:ethr:0xabc123',
        amount: 1000,
        purpose: 'Compute resources for AI training'
      });
      expect(result.error).toBeUndefined();
    });

    test('rejects negative amount', () => {
      const result = loanRequestSchema.validate({
        did: 'did:ethr:0xabc123',
        amount: -100
      });
      expect(result.error).toBeDefined();
      expect(result.error.message).toMatch(/must be at least 1/i);
    });

    test('rejects amount exceeding max', () => {
      const result = loanRequestSchema.validate({
        did: 'did:ethr:0xabc123',
        amount: 200000
      });
      expect(result.error).toBeDefined();
      expect(result.error.message).toMatch(/cannot exceed 100,000/i);
    });

    test('accepts request without purpose', () => {
      const result = loanRequestSchema.validate({
        did: 'did:ethr:0xabc123',
        amount: 500
      });
      expect(result.error).toBeUndefined();
    });

    test('rejects purpose exceeding 500 characters', () => {
      const result = loanRequestSchema.validate({
        did: 'did:ethr:0xabc123',
        amount: 500,
        purpose: 'a'.repeat(501)
      });
      expect(result.error).toBeDefined();
      expect(result.error.message).toMatch(/500 characters or less/i);
    });
  });

  describe('loanRepaymentSchema', () => {
    test('accepts valid repayment with txHash', () => {
      const result = loanRepaymentSchema.validate({
        loanId: '550e8400-e29b-41d4-a716-446655440000',
        repaymentTxHash: '0x' + '1'.repeat(64)
      });
      expect(result.error).toBeUndefined();
    });

    test('accepts repayment without txHash', () => {
      const result = loanRepaymentSchema.validate({
        loanId: '550e8400-e29b-41d4-a716-446655440000'
      });
      expect(result.error).toBeUndefined();
    });

    test('rejects invalid UUID', () => {
      const result = loanRepaymentSchema.validate({
        loanId: 'not-a-uuid'
      });
      expect(result.error).toBeDefined();
    });

    test('rejects invalid transaction hash format', () => {
      const result = loanRepaymentSchema.validate({
        loanId: '550e8400-e29b-41d4-a716-446655440000',
        repaymentTxHash: 'invalid-hash'
      });
      expect(result.error).toBeDefined();
    });
  });

  describe('capitalDeploySchema', () => {
    test('accepts valid deployment', () => {
      const result = capitalDeploySchema.validate({
        protocol: 'aave',
        amount: 1000
      });
      expect(result.error).toBeUndefined();
    });

    test('rejects invalid protocol', () => {
      const result = capitalDeploySchema.validate({
        protocol: 'invalid-protocol',
        amount: 1000
      });
      expect(result.error).toBeDefined();
      expect(result.error.message).toMatch(/aave, compound, yearn/i);
    });

    test('rejects amount below minimum', () => {
      const result = capitalDeploySchema.validate({
        protocol: 'aave',
        amount: 50
      });
      expect(result.error).toBeDefined();
      expect(result.error.message).toMatch(/100/i);
    });
  });

  describe('agentLoanRequestSchema', () => {
    test('accepts valid agent-to-agent loan request', () => {
      const result = agentLoanRequestSchema.validate({
        borrowerDid: 'did:ethr:0xborrower',
        lenderDid: 'did:ethr:0xlender',
        amount: 5000,
        interestRate: 12
      });
      expect(result.error).toBeUndefined();
    });

    test('rejects invalid borrower DID', () => {
      const result = agentLoanRequestSchema.validate({
        borrowerDid: 'invalid',
        lenderDid: 'did:ethr:0xlender',
        amount: 1000
      });
      expect(result.error).toBeDefined();
    });

    test('accepts request without interest rate', () => {
      const result = agentLoanRequestSchema.validate({
        borrowerDid: 'did:ethr:0xborrower',
        lenderDid: 'did:ethr:0xlender',
        amount: 1000
      });
      expect(result.error).toBeUndefined();
    });

    test('rejects negative interest rate', () => {
      const result = agentLoanRequestSchema.validate({
        borrowerDid: 'did:ethr:0xborrower',
        lenderDid: 'did:ethr:0xlender',
        amount: 1000,
        interestRate: -5
      });
      expect(result.error).toBeDefined();
    });

    test('rejects interest rate above 100%', () => {
      const result = agentLoanRequestSchema.validate({
        borrowerDid: 'did:ethr:0xborrower',
        lenderDid: 'did:ethr:0xlender',
        amount: 1000,
        interestRate: 150
      });
      expect(result.error).toBeDefined();
    });
  });
});
