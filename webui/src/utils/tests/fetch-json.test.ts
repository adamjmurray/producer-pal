// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { responseError } from "#webui/utils/fetch-json";

describe("responseError", () => {
  it("returns the error text from a JSON body", async () => {
    const response = new Response(JSON.stringify({ error: "too long" }));

    expect(await responseError(response)).toBe("too long");
  });

  it("returns null when the error is not a string", async () => {
    const response = new Response(JSON.stringify({ error: 5 }));

    expect(await responseError(response)).toBeNull();
  });

  it("returns null when the body is not JSON", async () => {
    expect(await responseError(new Response("<html>"))).toBeNull();
  });
});
