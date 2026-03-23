// Test environment detection logic
console.log('🌍 Testing Environment Detection...\n');

// Copy the detection logic from telegramChannel.js
const useWebhook = process.env.NODE_ENV === 'production' ||
                   process.env.RENDER ||
                   process.env.PORT ||
                   process.env.HEROKU_APP_NAME;

console.log('Environment Variables:');
console.log('NODE_ENV:', process.env.NODE_ENV || 'undefined');
console.log('RENDER:', process.env.RENDER || 'undefined');
console.log('PORT:', process.env.PORT || 'undefined');
console.log('HEROKU_APP_NAME:', process.env.HEROKU_APP_NAME || 'undefined');

console.log('\n🎯 Detection Result:');
console.log('useWebhook:', useWebhook);
console.log('Mode:', useWebhook ? 'WEBHOOK (production)' : 'POLLING (development)');

// Test bot configuration
console.log('\n🤖 Bot Configuration:');
console.log('polling setting:', !useWebhook);
console.log('webHook setting:', false);

if (useWebhook) {
  console.log('\n📡 WEBHOOK MODE ACTIVE:');
  console.log('- Should STOP polling');
  console.log('- Should CLEAR event listeners');
  console.log('- Messages handled via Express /webhook route');
} else {
  console.log('\n🔄 POLLING MODE ACTIVE:');
  console.log('- Should START polling');
  console.log('- Should ADD event listeners');
  console.log('- Messages handled via bot.on("message")');
}

console.log('\n⚠️ ISSUE ANALYSIS:');
if (useWebhook) {
  console.log('If you\'re still seeing "Unknown command" errors,');
  console.log('it means BOTH webhook AND polling handlers are active!');
  console.log('This creates the duplicate message processing.');
} else {
  console.log('Running in development polling mode.');
  console.log('Check if webhook route is also active.');
}