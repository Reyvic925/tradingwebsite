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

function getProviderByLabel(label) {
  const normalized = label.toLowerCase();
  const candidates = [
    window.ethereum,
    window.web3 && window.web3.currentProvider,
    window.trustwallet,
    window.coinbaseWallet,
    window.metamask,
    window.rabby,
    window.bitkeep,
    window.okxwallet,
    window.walletconnect,
    window.safe,
    window.phantom,
  ];

  if (normalized.includes('metamask')) return candidates.find((provider) => provider && typeof provider.request === 'function' && provider.isMetaMask) || candidates.find((provider) => provider && provider.isMetaMask) || null;
  if (normalized.includes('trust')) return candidates.find((provider) => provider && provider.isTrustWallet) || candidates.find((provider) => provider && provider.isTrustWallet === true) || null;
  if (normalized.includes('coinbase')) return candidates.find((provider) => provider && provider.isCoinbaseWallet) || null;
  if (normalized.includes('walletconnect')) return window.ethereum || detectProvider();
  return detectProvider();
}

async function connectWithProvider(provider, walletName = 'Wallet') {
  if (!provider) {
    setStatus(`No ${walletName} found. Install the browser wallet or try another option.`);
    setAddress('Not connected');
    return;
  }

  try {
    setStatus(`Requesting ${walletName} access...`);
    const accounts = await provider.request({ method: 'eth_requestAccounts' });
    const nextAddress = Array.isArray(accounts) && typeof accounts[0] === 'string' ? accounts[0] : null;

    if (!nextAddress) {
      setStatus('No wallet account selected');
      setAddress('Not connected');
      return;
    }

    setAddress(nextAddress);
    setStatus(`Connected: ${nextAddress.slice(0, 6)}...${nextAddress.slice(-4)}`);
    closeWalletModal();
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

function showWalletModal() {
  let modal = document.getElementById('walletConnectModal');
  if (modal) {
    modal.style.display = 'flex';
    return;
  }

  modal = document.createElement('div');
  modal.id = 'walletConnectModal';
  modal.style.position = 'fixed';
  modal.style.inset = '0';
  modal.style.background = 'rgba(9, 12, 18, 0.75)';
  modal.style.backdropFilter = 'blur(10px)';
  modal.style.display = 'flex';
  modal.style.alignItems = 'center';
  modal.style.justifyContent = 'center';
  modal.style.zIndex = '9999';

  const panel = document.createElement('div');
  panel.style.width = 'min(460px, calc(100vw - 24px))';
  panel.style.background = '#111827';
  panel.style.border = '1px solid rgba(255,255,255,0.08)';
  panel.style.borderRadius = '20px';
  panel.style.boxShadow = '0 25px 90px rgba(0,0,0,0.45)';
  panel.style.padding = '20px';
  panel.style.color = '#f3f4f6';
  panel.style.fontFamily = 'Inter, sans-serif';

  const top = document.createElement('div');
  top.style.display = 'flex';
  top.style.alignItems = 'center';
  top.style.justifyContent = 'space-between';
  top.style.marginBottom = '16px';

  const titleWrap = document.createElement('div');
  const title = document.createElement('div');
  title.textContent = 'Connect Wallet';
  title.style.fontSize = '22px';
  title.style.fontWeight = '700';
  title.style.letterSpacing = '-0.02em';

  const subtitle = document.createElement('div');
  subtitle.textContent = 'Continue with GitHub or choose a wallet';
  subtitle.style.marginTop = '6px';
  subtitle.style.color = '#9ca3af';
  subtitle.style.fontSize = '12px';

  titleWrap.appendChild(title);
  titleWrap.appendChild(subtitle);

  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '✕';
  close.style.border = 'none';
  close.style.background = 'transparent';
  close.style.color = '#d1d5db';
  close.style.cursor = 'pointer';
  close.style.fontSize = '18px';
  close.addEventListener('click', closeWalletModal);

  top.appendChild(titleWrap);
  top.appendChild(close);

  const githubBtn = document.createElement('button');
  githubBtn.type = 'button';
  githubBtn.textContent = 'Continue with Github';
  githubBtn.style.width = '100%';
  githubBtn.style.background = '#1f2937';
  githubBtn.style.border = '1px solid rgba(255,255,255,0.08)';
  githubBtn.style.borderRadius = '14px';
  githubBtn.style.color = '#f9fafb';
  githubBtn.style.padding = '14px 16px';
  githubBtn.style.fontSize = '14px';
  githubBtn.style.fontWeight = '600';
  githubBtn.style.cursor = 'pointer';
  githubBtn.style.marginBottom = '16px';
  githubBtn.addEventListener('click', () => {
    setStatus('GitHub continue flow is available in the app shell.');
    closeWalletModal();
  });

  const walletGrid = document.createElement('div');
  walletGrid.style.display = 'grid';
  walletGrid.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
  walletGrid.style.gap = '10px';

  const options = [
    { label: 'WalletConnect', accent: '#2dd4bf' },
    { label: 'Trust Wallet', accent: '#60a5fa' },
    { label: 'MetaMask', accent: '#f59e0b' },
    { label: 'Search Wallet', accent: '#a78bfa' },
  ];

  for (const option of options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = option.label;
    button.style.background = '#0b1220';
    button.style.border = `1px solid ${option.accent}33`;
    button.style.borderRadius = '12px';
    button.style.color = '#f5f5f5';
    button.style.padding = '14px 12px';
    button.style.cursor = 'pointer';
    button.style.fontSize = '13px';
    button.style.fontWeight = '600';
    button.addEventListener('click', async () => {
      const walletName = option.label;
      if (walletName === 'Search Wallet') {
        setStatus('Search Wallet selected. Install a wallet and refresh.');
        setAddress('Not connected');
        try {
          window.open('https://wallets.coingecko.com/', '_blank', 'noopener,noreferrer');
        } catch (error) {
          console.warn('Wallet install redirect failed:', error);
        }
        closeWalletModal();
        return;
      }
      if (walletName === 'WalletConnect') {
        setStatus('WalletConnect QR flow selected. Use the app to scan a session request.');
        closeWalletModal();
        return;
      }
      const provider = getProviderByLabel(walletName);
      await connectWithProvider(provider, walletName);
    });
    walletGrid.appendChild(button);
  }

  const qr = document.createElement('div');
  qr.style.marginTop = '16px';
  qr.style.border = '1px dashed rgba(255,255,255,0.15)';
  qr.style.borderRadius = '14px';
  qr.style.padding = '16px';
  qr.style.textAlign = 'center';
  qr.style.color = '#a5b4fc';
  qr.style.fontSize = '12px';
  qr.style.letterSpacing = '0.08em';
  qr.style.textTransform = 'uppercase';
  qr.textContent = 'QR Code';

  const footer = document.createElement('div');
  footer.style.marginTop = '16px';
  footer.style.textAlign = 'center';
  footer.style.color = '#6b7280';
  footer.style.fontSize = '11px';
  footer.innerHTML = 'UX by <a href="https://reown.com/" target="_blank" rel="noreferrer" style="color:#c4b5fd; text-decoration:none;">Reown</a>';

  panel.appendChild(top);
  panel.appendChild(githubBtn);
  panel.appendChild(walletGrid);
  panel.appendChild(qr);
  panel.appendChild(footer);

  modal.appendChild(panel);
  document.body.appendChild(modal);
}

function closeWalletModal() {
  const modal = document.getElementById('walletConnectModal');
  if (modal) modal.remove();
}

function attachWalletHandlers() {
  const connectBtn = document.getElementById('walletConnectBtn');
  if (connectBtn) {
    connectBtn.addEventListener('click', showWalletModal);
  }

  setStatus('No wallet connected yet');
  setAddress('Not connected');
}

document.addEventListener('DOMContentLoaded', attachWalletHandlers);