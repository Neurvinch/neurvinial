require('dotenv').config();
const mongoose = require('mongoose');
const Loan = require('./core/models/Loan');

async function checkLoan() {
  await mongoose.connect(process.env.MONGODB_URI);
  
  // Find the problematic loan
  const loan = await Loan.findOne({ loanId: 'SENTINEL-1774278666439-y9j3u1' });
  
  console.log('Loan found:', JSON.stringify(loan, null, 2));
  
  await mongoose.disconnect();
}

checkLoan().catch(console.error);
