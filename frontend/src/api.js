// API service — all calls to the Sentinel backend
// Auto-discovers backend port: tries 3000, then 3001, then 3002
const PORTS = [3000, 3001, 3002];

let BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';
let discovered = false;

// Ping each port at startup and lock onto the first responding one
async function discoverBackend() {
  if (discovered) return BASE;
  for (const port of PORTS) {
    try {
      const url = `http://localhost:${port}`;
      const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(800) });
      if (res.ok) {
        BASE = url;
        discovered = true;
        console.log(`[sentinel] Backend found at ${BASE}`);
        return BASE;
      }
    } catch {
      // Port not responding — try next
    }
  }
  console.warn('[sentinel] Backend not reachable — is `bun run dev` running?');
  return BASE;
}

// Run discovery once on load
discoverBackend();

async function req(method, path, body) {
  // Ensure we have the right base before each call
  await discoverBackend();

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
  health:        ()        => req('GET',  '/health'),
  registerAgent: (metadata)=> req('POST', '/agents/register', { metadata }),
  getScore:      (did)     => req('GET',  `/agents/${encodeURIComponent(did)}/score`),
  getAgent:      (did)     => req('GET',  `/agents/${encodeURIComponent(did)}`),
  requestLoan:   (payload) => req('POST', '/loans/request', payload),
  getLoanStatus: (id)      => req('GET',  `/loans/${id}/status`),
  disburseLoan:  (id)      => req('POST', `/loans/${id}/disburse`),
  repayLoan:     (id)      => req('POST', `/loans/${id}/repay`),
  capitalStatus: ()        => req('GET',  '/capital/status'),
};
