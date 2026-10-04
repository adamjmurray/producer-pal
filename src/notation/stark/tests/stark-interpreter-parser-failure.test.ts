// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { parseNotation } from "#src/notation/stark/stark-interpreter.ts";

const parse = vi.hoisted(() => vi.fn());

// The grammar throws only SyntaxErrors, so a stand-in parser throws the rest.
vi.mock(
  import("#src/notation/stark/parser/stark-parser.ts"),
  async (importOriginal) => ({ ...(await importOriginal()), parse }),
);

describe("Stark parseNotation() - a parser failure", () => {
  it("names a non-syntax error as a parse error, keeping the cause", () => {
    const cause = new Error("boom");

    parse.mockImplementation(() => {
      throw cause;
    });

    let thrown: unknown;

    try {
      parseNotation("C4");
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("Stark notation parse error: boom");
    expect((thrown as Error).cause).toBe(cause);
  });
});
