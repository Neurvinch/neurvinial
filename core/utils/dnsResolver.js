// ============================================
// DNS Resolver with Google DNS (8.8.8.8)
// ============================================
// Resolves MongoDB SRV records using external DNS servers
// to bypass ISP DNS timeout issues

const dns = require('dns');
const { Resolver } = dns.promises;

// Create resolver using Google's public DNS
const resolver = new Resolver();
resolver.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']); // Google DNS + Cloudflare

/**
 * Configure DNS to use Google DNS and prefer IPv4
 */
function configureDNS() {
  // Force IPv4 first
  dns.setDefaultResultOrder('ipv4first');

  // Set custom DNS servers globally
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

  console.log('✓ DNS configured: Google DNS (8.8.8.8) + IPv4 priority');
}

/**
 * Test DNS resolution for MongoDB cluster
 */
async function testMongoDBDNS(clusterHost) {
  try {
    const srvRecord = `_mongodb._tcp.${clusterHost}`;
    console.log(`Testing SRV resolution: ${srvRecord}`);

    const records = await resolver.resolveSrv(srvRecord);
    console.log(`✓ Resolved ${records.length} MongoDB hosts:`,
      records.map(r => `${r.name}:${r.port}`).join(', '));
    return true;
  } catch (error) {
    console.error(`✗ DNS resolution failed: ${error.message}`);
    return false;
  }
}

module.exports = {
  configureDNS,
  testMongoDBDNS,
  resolver
};
