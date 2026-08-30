const state = {
  provider: null,
  address: null,
};

function setStatus(message) {
  const el = document.getElementById('status');
  if (el) el.textContent = message;
}

function setAddress(address) {
  const el = document.getElementById('walletAddress');
  if (el) el.textContent = address || 'Not connected';
}

function detectProvider() {
  const injected = window.ethereum;
  if (!injected) return null;

  if (Array.isArray(injected.providers)) {
    return injected.providers.find((provider) => provider && typeof provider.request === 'function') || null;
  }

  if (typeof injected.request === 'function') {
    return injected;
  }

  return null;
}

async function connectWallet() {
  const provider = detectProvider();

  if (!provider) {
    setStatus('No compatible wallet found. Install a browser wallet and refresh.');
    return;
  }

  state.provider = provider;

  try {
    setStatus('Requesting wallet access...');
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    const nextAddress = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : null;

    if (!nextAddress) {
      setStatus('No account selected');
      return;
    }

    state.address = nextAddress;
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

async function signMessage() {
  if (!state.provider || !state.address) {
    setStatus('Connect a wallet first');
    return;
  }

  try {
    setStatus('Requesting signature...');
    const message = `Apex Prime wallet check for ${state.address}`;
    const signature = await state.provider.request({
      method: 'personal_sign',
      params: [message, state.address],
    });

    setStatus(`Signature generated: ${String(signature).slice(0, 16)}...`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.toLowerCase().includes('rejected')) {
      setStatus('Signature cancelled by user');
      return;
    }

    console.error('Signature failed:', error);
    setStatus('Signature failed');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const connectBtn = document.getElementById('connectBtn');
  const signBtn = document.getElementById('signBtn');

  if (connectBtn) connectBtn.addEventListener('click', connectWallet);
  if (signBtn) signBtn.addEventListener('click', signMessage);

  setStatus('Wallet not connected');
  setAddress('Not connected');
});
