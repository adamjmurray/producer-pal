// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { errorMessage } from "./error-utils.ts";

describe("errorMessage", () => {
  it("should extract message from Error instance", () => {
    const error = new Error("test error message");

    expect(errorMessage(error)).toBe("test error message");
  });

  it("should convert non-Error values to string", () => {
    expect(errorMessage("string error")).toBe("string error");
    expect(errorMessage(123)).toBe("123");
    expect(errorMessage({ message: "object" })).toBe("[object Object]");
    expect(errorMessage(null)).toBe("null");
    expect(errorMessage(undefined)).toBe("undefined");
  });
});
