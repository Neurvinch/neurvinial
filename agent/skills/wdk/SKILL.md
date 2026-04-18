---
name: neurvinial_wdk
description: Execute on-chain transactions using Tether WDK. Transfer USDT, check balances, and manage wallets.
---

# Sentinel WDK Skill

You have access to Tether's Wallet Development Kit (WDK) for executing on-chain operations.

## Available Operations

### 1. Check USDT Balance
Query the USDT balance of any Ethereum address.

**API Call:**
```
GET {{Neurvinial_API_URL}}/capital/status
```

**Response:**
```json
{
  "reserves": {
    "usdt": 5000,
    "eth": 0.5
  }
}
```

### 2. Send USDT (Loan Disbursement)
Transfer USDT from Sentinel's treasury to a borrower.

**API Call:**
```
POST {{Neurvinial_API_URL}}/loans/{{loanId}}/disburse
```

**Response:**
```json
{
  "txHash": "0xabc123...",
  "amount": 500,
  "fee": "0.002",
  "status": "disbursed"
}
```

### 3. Create Wallet for Agent
Generate a new WDK wallet for a registered agent.

**API Call:**
```
POST {{Neurvinial_API_URL}}/agents/register
Body: { "did": "did:ethr:0x..." }
```

**Response:**
```json
{
  "did": "did:ethr:0x...",
  "walletAddress": "0xNEW_WALLET...",
  "walletIndex": 42
}
```

### 4. Liquidate Collateral
Execute collateral liquidation for defaulted loans.

**Trigger:** Automatic when loan status changes to `defaulted`

**Process:**
1. Loan defaults (deadline passed, no repayment)
2. Sentinel invokes WDK to transfer collateral
3. Transaction hash recorded
4. Borrower credit score reduced

## WDK Configuration

The WDK uses these environment variables:
- `WDK_SEED_PHRASE`: 12-word mnemonic (never logged)
- `WDK_BLOCKCHAIN`: `ethereum`
- `WDK_NETWORK`: `sepolia` (testnet) or `mainnet`
- `WDK_RPC_URL`: Ethereum RPC endpoint

## Supported Networks

| Network | Chain ID | USDT Contract |
|---------|----------|---------------|
| Ethereum Mainnet | 1 | 0xdAC17F958D2ee523a2206206994597C13D831ec7 |
| Sepolia Testnet | 11155111 | 0x7169D38820dfd117C3FA1f22a697dBA58d90BA06 |
| Polygon | 137 | 0xc2132D05D31c914a87C6611C10748AEb04B58e8F |

## ERC-4337 Gasless Transactions (Advanced)

Sentinel supports gasless transactions via ERC-4337 account abstraction.

**Benefits:**
- Borrowers don't need ETH for gas
- Paymaster covers transaction fees
- Batch multiple operations

**API (if enabled):**
```
POST {{Neurvinial_API_URL}}/wdk/gasless-transfer
Body: {
  "to": "0xRecipient...",
  "amount": 100
}
```

## Important Rules

- NEVER log or expose seed phrases
- ALWAYS verify recipient address before transfer
- CHECK balance before disbursement
- RECORD all transaction hashes for audit trail
- USE testnet (Sepolia) for development, mainnet for production
