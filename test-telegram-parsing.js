// Quick test of Telegram command parsing logic
console.log('Testing Telegram Command Parsing Logic...\n');

// Copy the parseCommand function from telegramChannel.js
const parseCommand = (text) => {
  const match = text.match(/^\/(\w+)\s*(.*)/);
  if (!match) return null;
  return { command: match[1].toLowerCase(), args: match[2] };
};

// Test cases from your screenshot
const testCommands = [
  '/approve',
  '/history',
  '/wallet',
  '/repay',
  '/health',
  '/status',
  '/register'
];

console.log('🧪 Testing parseCommand function:');
testCommands.forEach(cmd => {
  const result = parseCommand(cmd);
  console.log(`"${cmd}" → ${JSON.stringify(result)}`);
});

// Test the switch logic
console.log('\n🔀 Testing switch case logic:');

const testSwitchCase = (commandText) => {
  const command = parseCommand(commandText);
  if (!command) {
    console.log(`❌ ${commandText}: No command parsed`);
    return;
  }

  console.log(`📝 ${commandText}: Parsed as "${command.command}"`);

  // Simulate the switch statement
  switch (command.command) {
    case 'approve':
    case 'eligible':
    case 'check':
      console.log(`✅ ${commandText}: Would call handleApprove()`);
      break;
    case 'history':
    case 'loans':
    case 'past':
      console.log(`✅ ${commandText}: Would call handleHistory()`);
      break;
    case 'wallet':
    case 'address':
      console.log(`✅ ${commandText}: Would call handleWallet()`);
      break;
    case 'repay':
    case 'pay':
    case 'payback':
      console.log(`✅ ${commandText}: Would call handleRepay()`);
      break;
    case 'health':
    case 'system':
    case 'uptime':
      console.log(`✅ ${commandText}: Would call handleHealth()`);
      break;
    case 'status':
      console.log(`✅ ${commandText}: Would call handleStatus()`);
      break;
    default:
      console.log(`❌ ${commandText}: Would show "Unknown command: /${command.command}"`);
  }
};

console.log('\nTesting broken commands from your screenshot:');
testSwitchCase('/approve');
testSwitchCase('/history');
testSwitchCase('/wallet');
testSwitchCase('/repay');
testSwitchCase('/health');

console.log('\n🎯 Analysis complete!');