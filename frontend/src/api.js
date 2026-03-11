// API service — all calls to the Sentinel backend
const BASE = 'http://localhost:3000';

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Request failed');
  return data;
}

export const api = {
  health:          ()           => req('GET',  '/health'),
  registerAgent:   (metadata)   => req('POST', '/agents/register', { metadata }),
  getScore:        (did)        => req('GET',  `/agents/${encodeURIComponent(did)}/score`),
  getAgent:        (did)        => req('GET',  `/agents/${encodeURIComponent(did)}`),
  requestLoan:     (payload)    => req('POST', '/loans/request', payload),
  getLoanStatus:   (id)         => req('GET',  `/loans/${id}/status`),
  disburseLoan:    (id)         => req('POST', `/loans/${id}/disburse`),
  repayLoan:       (id)         => req('POST', `/loans/${id}/repay`),
  capitalStatus:   ()           => req('GET',  '/capital/status'),
};
