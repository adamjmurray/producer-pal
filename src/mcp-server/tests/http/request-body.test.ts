// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Request } from "express";
import { describe, expect, it } from "vitest";
import { requestBody } from "#src/mcp-server/helpers/http/request-body.ts";

/**
 * Build a minimal Request stand-in carrying just a `body`.
 * @param body - The value to expose as req.body
 * @returns A Request-shaped object with the given body
 */
function reqWith(body: unknown): Request {
  return { body } as Request;
}

describe("requestBody", () => {
  it("returns a parsed object body unchanged", () => {
    const body = { content: "hi", createOnly: true };

    expect(requestBody(reqWith(body))).toBe(body);
  });

  it("normalizes a missing (undefined) body to {}", () => {
    expect(requestBody(reqWith(undefined))).toStrictEqual({});
  });

  it("normalizes a null body to {}", () => {
    expect(requestBody(reqWith(null))).toStrictEqual({});
  });

  it("normalizes a JSON array body to {}", () => {
    expect(requestBody(reqWith([1, 2, 3]))).toStrictEqual({});
  });

  it("normalizes a bare scalar body to {}", () => {
    expect(requestBody(reqWith("just a string"))).toStrictEqual({});
  });
});
