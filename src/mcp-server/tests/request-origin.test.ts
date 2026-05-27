// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { isLocalOrigin } from "../helpers/request-origin.ts";

describe("isLocalOrigin", () => {
  it("returns true for localhost origins", () => {
    expect(isLocalOrigin("http://localhost")).toBe(true);
    expect(isLocalOrigin("http://localhost:7777")).toBe(true);
    expect(isLocalOrigin("https://localhost:8080")).toBe(true);
  });

  it("returns true for 127.0.0.1 origins", () => {
    expect(isLocalOrigin("http://127.0.0.1")).toBe(true);
    expect(isLocalOrigin("http://127.0.0.1:7777")).toBe(true);
  });

  it("returns true for [::1] origins", () => {
    expect(isLocalOrigin("http://[::1]:7777")).toBe(true);
  });

  it("returns false for non-local origins", () => {
    expect(isLocalOrigin("https://example.com")).toBe(false);
    expect(isLocalOrigin("http://192.168.1.5:7777")).toBe(false);
  });

  it("returns false for unparseable origin strings", () => {
    expect(isLocalOrigin("not a url")).toBe(false);
    expect(isLocalOrigin("")).toBe(false);
  });
});
