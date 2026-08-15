// Test fetching wallet addresses with demo auth token
fetch('http://localhost:5173/api/user/crypto-addresses', {
  method: 'GET',
  headers: {
    'Authorization': 'Bearer local-demo-token',
    'Content-Type': 'application/json'
  }
})
.then(r => {
  console.log('Status:', r.status);
  return r.json();
})
.then(data => {
  console.log('Crypto Addresses Response:');
  console.log(JSON.stringify(data, null, 2));
  if (Array.isArray(data) && data.length > 0) {
    console.log('\nWallet Summary:');
    data.forEach((addr, i) => {
      console.log(`${i + 1}. ${addr.currency || 'UNKNOWN'} on ${addr.network || 'unknown'}: ${addr.address.slice(0, 12)}...`);
    });
  }
})
.catch(err => console.error('Error:', err.message));
