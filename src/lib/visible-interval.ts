export function startVisibleInterval(
  callback: () => void | Promise<void>,
  delay: number
): () => void {
  let interval: number | undefined;
  let inFlight = false;
  let stopped = false;
  let wasVisible = document.visibilityState === 'visible';

  const tick = () => {
    if (inFlight || stopped) return;
    inFlight = true;
    void Promise.resolve()
      .then(() => { if (!stopped) return callback(); })
      .finally(() => {
        inFlight = false;
      });
  };

  const syncVisibility = () => {
    if (document.visibilityState === 'visible') {
      if (!wasVisible) tick();
      if (interval === undefined) interval = window.setInterval(tick, delay);
    } else if (interval !== undefined) {
      window.clearInterval(interval);
      interval = undefined;
    }
    wasVisible = document.visibilityState === 'visible';
  };

  if (wasVisible) tick();
  document.addEventListener('visibilitychange', syncVisibility);
  syncVisibility();

  return () => {
    stopped = true;
    document.removeEventListener('visibilitychange', syncVisibility);
    if (interval !== undefined) window.clearInterval(interval);
  };
}
