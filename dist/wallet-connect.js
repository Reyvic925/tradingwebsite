function setStatus(message) {
  const el = document.getElementById('walletStatus');
  if (el) el.textContent = message;
}

function setAddress(address) {
  const el = document.getElementById('walletAddress');
  if (el) el.textContent = address || 'Not connected';
}

function detectProvider() {
  const providers = [];
  const seen = new Set();

  const pushCandidate = (candidate) => {
    if (!candidate || typeof candidate !== 'object') return;
    if (seen.has(candidate)) return;
    seen.add(candidate);

    if (typeof candidate.request === 'function') {
      providers.push(candidate);
    }

    if (Array.isArray(candidate.providers)) {
      for (const provider of candidate.providers) {
        if (provider && typeof provider.request === 'function' && !seen.has(provider)) {
          seen.add(provider);
          providers.push(provider);
        }
      }
    }
  };

  pushCandidate(window.ethereum);
  if (window.web3 && window.web3.currentProvider) {
    pushCandidate(window.web3.currentProvider);
  }

  const walletKeys = ['trustwallet', 'coinbaseWallet', 'metamask', 'rabby', 'bitkeep', 'okxwallet', 'walletconnect', 'safe', 'phantom'];

  for (const key of walletKeys) {
    if (window[key]) {
      pushCandidate(window[key]);
    }
  }

  for (const key in window) {
    if (key === 'ethereum' || key === 'web3' || walletKeys.includes(key)) continue;
    const value = window[key];
    if (value && typeof value === 'object') {
      pushCandidate(value);
    }
  }

  return providers[0] || null;
}

async function connectWallet() {
  const provider = detectProvider();

  if (!provider) {
    setStatus('No compatible browser wallet found. Install MetaMask, Trust Wallet, Rabby, or another EVM wallet and refresh.');
    setAddress('Not connected');
    try {
      window.open('https://wallets.coingecko.com/', '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.warn('Wallet install redirect failed:', error);
    }
    return;
  }

  try {
    setStatus('Requesting wallet access...');
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    const nextAddress = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : null;

    if (!nextAddress) {
      setStatus('No wallet account selected');
      setAddress('Not connected');
      return;
    }

    setAddress(nextAddress);
    setStatus(`Connected: ${nextAddress.slice(0, 6)}...${nextAddress.slice(-4)}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('rejected')) {
      setStatus('Connection cancelled by user');
      return;
    }
    console.error('Wallet connection failed:', error);
    setStatus('Connection failed');
  }
}

function attachWalletHandlers() {
  const connectBtn = document.getElementById('walletConnectBtn');
  if (connectBtn) {
    connectBtn.addEventListener('click', connectWallet);
  }

  setStatus('No wallet connected yet');
  setAddress('Not connected');
}

document.addEventListener('DOMContentLoaded', attachWalletHandlers);