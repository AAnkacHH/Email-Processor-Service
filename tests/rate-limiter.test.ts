import { describe, it, expect } from 'vitest';
import { InMemoryRateLimiter } from '../src/rate-limiter.js';

describe('InMemoryRateLimiter', () => {
  it('allows requests up to the limit', async () => {
    const limiter = new InMemoryRateLimiter(3);

    expect(await limiter.check('https://ankach.com')).toBe(true);  // 1
    expect(await limiter.check('https://ankach.com')).toBe(true);  // 2
    expect(await limiter.check('https://ankach.com')).toBe(true);  // 3
    expect(await limiter.check('https://ankach.com')).toBe(false); // 4 → blocked
  });

  it('tracks origins independently', async () => {
    const limiter = new InMemoryRateLimiter(2);

    expect(await limiter.check('https://a.com')).toBe(true);
    expect(await limiter.check('https://a.com')).toBe(true);
    expect(await limiter.check('https://a.com')).toBe(false); // a.com exhausted

    // b.com should still have its own quota
    expect(await limiter.check('https://b.com')).toBe(true);
    expect(await limiter.check('https://b.com')).toBe(true);
    expect(await limiter.check('https://b.com')).toBe(false);
  });

  it('defaults to 5 per hour', async () => {
    const limiter = new InMemoryRateLimiter();

    for (let i = 0; i < 5; i++) {
      expect(await limiter.check('https://test.com')).toBe(true);
    }
    expect(await limiter.check('https://test.com')).toBe(false);
  });
});
