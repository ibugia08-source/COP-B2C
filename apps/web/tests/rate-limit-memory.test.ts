import { describe, expect, it } from "vitest";
import { checkMemoryRateLimit } from "@/lib/rate-limit-memory";

describe("checkMemoryRateLimit", () => {
  it("permite até o limite e bloqueia o excedente na janela", () => {
    const key = `t1:${Math.random()}`;
    const now = 1_000_000;
    for (let i = 0; i < 3; i++) {
      expect(checkMemoryRateLimit(key, 3, 10_000, now).allowed).toBe(true);
    }
    const blocked = checkMemoryRateLimit(key, 3, 10_000, now);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("libera novamente após a janela expirar", () => {
    const key = `t2:${Math.random()}`;
    const start = 5_000_000;
    for (let i = 0; i < 3; i++) checkMemoryRateLimit(key, 3, 10_000, start);
    expect(checkMemoryRateLimit(key, 3, 10_000, start).allowed).toBe(false);
    // passou a janela inteira → contagem zera
    expect(checkMemoryRateLimit(key, 3, 10_000, start + 10_001).allowed).toBe(true);
  });

  it("isola chaves diferentes (IP/slug distintos não se afetam)", () => {
    const now = 9_000_000;
    for (let i = 0; i < 3; i++) checkMemoryRateLimit(`a:${now}`, 3, 10_000, now);
    expect(checkMemoryRateLimit(`a:${now}`, 3, 10_000, now).allowed).toBe(false);
    expect(checkMemoryRateLimit(`b:${now}`, 3, 10_000, now).allowed).toBe(true);
  });
});
