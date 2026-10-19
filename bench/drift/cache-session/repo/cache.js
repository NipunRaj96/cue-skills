// LRU cache with an optional TTL. Recency is tracked by Map insertion order:
// the first key in the Map is the least recently used one.
export class Cache {
  constructor({ max = 100, ttlMs = 0, now = Date.now } = {}) {
    this.max = max;
    this.ttlMs = ttlMs;
    this.now = now;
    this.map = new Map();
  }

  get size() {
    return this.map.size;
  }

  has(key) {
    const e = this.map.get(key);
    if (!e) return false;
    if (e.expires && e.expires <= this.now()) {
      this.map.delete(key);
      return false;
    }
    return true;
  }

  get(key) {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (e.expires && e.expires <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key, value) {
    this.map.delete(key);
    this.map.set(key, { value, expires: this.ttlMs ? this.now() + this.ttlMs : 0 });
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value);
  }

  delete(key) {
    return this.map.delete(key);
  }
}
