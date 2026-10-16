const REQUEST_TIMEOUT_MS = 15_000;

export async function withRequestTimeout<T>(
  request: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error('Request timed out. Please try again.'));
    }, REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([request(controller.signal), timeout]);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Request timed out. Please try again.');
    }
    throw error;
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}
