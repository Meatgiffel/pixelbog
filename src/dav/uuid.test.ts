import { afterEach, describe, expect, it, vi } from "vitest";
import { uuid } from "./carddav";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("uuid", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("bruger crypto.randomUUID, når den findes", () => {
    expect(uuid()).toMatch(V4);
  });

  it("virker uden crypto.randomUUID (http:// på LAN)", () => {
    vi.stubGlobal("crypto", { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const ids = new Set(Array.from({ length: 50 }, uuid));
    expect(ids.size).toBe(50);
    for (const id of ids) expect(id).toMatch(V4);
  });
});
