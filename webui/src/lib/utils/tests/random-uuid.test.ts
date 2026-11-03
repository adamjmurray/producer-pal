// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUuid } from "#webui/lib/utils/random-uuid";

const V4_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("randomUuid", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses crypto.randomUUID when the page has it", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "from-crypto" });

    expect(randomUuid()).toBe("from-crypto");
  });

  it("builds a v4 UUID on a page without crypto.randomUUID", () => {
    const { getRandomValues } = crypto;

    vi.stubGlobal("crypto", {
      getRandomValues: getRandomValues.bind(crypto),
    });

    const a = randomUuid();
    const b = randomUuid();

    expect(a).toMatch(V4_UUID);
    expect(b).toMatch(V4_UUID);
    expect(a).not.toBe(b);
  });

  it("sets the version and variant bits whatever the random bytes are", () => {
    vi.stubGlobal("crypto", {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(0xff),
    });

    expect(randomUuid()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
  });
});
