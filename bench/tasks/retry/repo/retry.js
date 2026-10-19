const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function retry(fn, { attempts = 3, delay = 10, factor = 2, maxDelay = Infinity } = {}) {
  let wait = delay;
  let lastError;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn(i);
    } catch (e) {
      lastError = e;
      if (i < attempts - 1) {
        await sleep(wait);
        wait = wait * factor;
      }
    }
  }
  throw lastError;
}
