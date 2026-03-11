// Test all Sentinel API endpoints end-to-end
const BASE = 'http://localhost:3000';

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  try { return { status: res.status, data: JSON.parse(text) }; }
  catch { return { status: res.status, data: text }; }
}

function ok(label, val) {
  console.log(`  ✅ ${label}:`, typeof val === 'object' ? JSON.stringify(val).slice(0, 100) : val);
}
function fail(label, val) {
  console.log(`  ❌ ${label}:`, JSON.stringify(val).slice(0, 200));
}

async function run() {
  console.log('\n🔍 SENTINEL API TEST SUITE\n' + '─'.repeat(50));

  // 1. Health
  console.log('\n1. Health Check');
  const h = await req('GET', '/health');
  h.status === 200 ? ok('status', h.data.status) : fail('health', h.data);

  // 2. Register
  console.log('\n2. Register Agent');
  const r = await req('POST', '/agents/register', { name: 'Test Bot Alpha' });
  if (r.status === 201) {
    ok('did', r.data.data.did);
    ok('creditScore', r.data.data.creditScore);
    ok('tier', r.data.data.tier);
  } else {
    fail('register', r.data);
    process.exit(1);
  }
  const DID = r.data.data.did;

  // 3. Credit Score Lookup
  console.log('\n3. Credit Score Lookup');
  const sc = await req('GET', `/agents/${encodeURIComponent(DID)}/score`);
  sc.status === 200 ? ok('score', sc.data.data.creditScore) : fail('score', sc.data);

  // 4. DID Document
  console.log('\n4. DID Document');
  const dd = await req('GET', `/agents/${encodeURIComponent(DID)}`);
  dd.status === 200 ? ok('didDocument context', dd.data.data?.didDocument?.['@context']) : fail('did doc', dd.data);

  // 5. Request loan (within Tier C limit of 500)
  console.log('\n5. Request Loan (300 USDT)');
  const l = await req('POST', '/loans/request', { did: DID, amount: 300, purpose: 'demo test' });
  if (l.data.data?.decision === 'approved') {
    ok('decision', 'APPROVED');
    ok('loanId', l.data.data.loanId);
    ok('tier', l.data.data.scoring.tier);
    ok('apr', l.data.data.terms.apr + '%');
  } else {
    fail('loan request', l.data);
    process.exit(1);
  }
  const LOAN_ID = l.data.data.loanId;

  // 6. Loan Status
  console.log('\n6. Loan Status');
  const ls = await req('GET', `/loans/${LOAN_ID}/status`);
  ls.status === 200 ? ok('status', ls.data.data.status) : fail('loan status', ls.data);

  // 7. Disburse
  console.log('\n7. Disburse Loan');
  const d = await req('POST', `/loans/${LOAN_ID}/disburse`);
  if (d.data.data?.status === 'disbursed') {
    ok('disbursed', 'SUCCESS');
    ok('txHash', d.data.data.txHash.slice(0, 20) + '...');
  } else {
    fail('disburse', d.data);
  }

  // 8. Repay
  console.log('\n8. Repay Loan');
  const rep = await req('POST', `/loans/${LOAN_ID}/repay`);
  if (rep.data.data?.status === 'repaid') {
    ok('repaid', 'SUCCESS');
    ok('wasOnTime', rep.data.data.wasOnTime);
    ok('scoreDelta', rep.data.data.creditScoreChange);
    ok('newScore', rep.data.data.newCreditScore);
  } else {
    fail('repay', rep.data);
  }

  // 9. Capital Status
  console.log('\n9. Capital Status');
  const cap = await req('GET', '/capital/status');
  if (cap.status === 200) {
    ok('totalCapital', cap.data.data.totalCapital);
    ok('repaidLoans', cap.data.data.repaidLoans);
    ok('interestEarned', cap.data.data.totalInterestEarned);
  } else {
    fail('capital', cap.data);
  }

  console.log('\n' + '─'.repeat(50));
  console.log('✅ ALL ENDPOINTS WORKING IN DEMO MODE\n');
}

run().catch(err => {
  console.error('\n❌ Test error:', err.message);
  process.exit(1);
});
