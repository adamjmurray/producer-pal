// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeErrorMessage } from "#webui/lib/error-formatters";

describe("normalizeErrorMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns Error message unchanged when it already starts with 'Error'", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(normalizeErrorMessage(new Error("boom"))).toBe("Error: boom");
  });

  it("prefixes 'Error: ' to string values that don't start with 'Error'", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(normalizeErrorMessage("network down")).toBe("Error: network down");
  });

  it("prefixes 'Error: ' to non-string values that don't start with 'Error'", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    expect(normalizeErrorMessage({ code: 42 })).toBe("Error: [object Object]");
  });
});
