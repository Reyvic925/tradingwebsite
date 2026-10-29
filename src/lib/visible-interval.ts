export function startVisibleInterval(
  callback: () => void | Promise<void>,
  delay: number
): () => void {
  let interval: number | undefined;
  let inFlight = false;

  const tick = () => {
    if (inFlight) return;
    inFlight = true;
    void Promise.resolve()
      .then(callback)
      .finally(() => {
        inFlight = false;
      });
  };

  const syncVisibility = () => {
    if (document.visibilityState === 'visible') {
      if (interval === undefined) interval = window.setInterval(tick, delay);
    } else if (interval !== undefined) {
      window.clearInterval(interval);
      interval = undefined;
    }
  };

  tick();
  document.addEventListener('visibilitychange', syncVisibility);
  syncVisibility();

  return () => {
    document.removeEventListener('visibilitychange', syncVisibility);
    if (interval !== undefined) window.clearInterval(interval);
  };
}
