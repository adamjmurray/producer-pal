// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { createNote } from "#src/test/test-data-builders.ts";

const parse = vi.hoisted(() => vi.fn());

// The grammar never produces an element the interpreter doesn't know, so a
// stand-in parser supplies one.
vi.mock(
  import("#src/notation/barbeat/parser/barbeat-parser.ts"),
  async (importOriginal) => ({ ...(await importOriginal()), parse }),
);

describe("bar|beat interpretNotation() - unknown elements", () => {
  it("skips an element it doesn't know, keeping the buffered pitches", () => {
    parse.mockReturnValue([{ pitch: 60 }, {}, { bar: 1, beat: 1 }]);

    expect(interpretNotation("C3 ? 1|1")).toStrictEqual([createNote()]);
    expect(capturedWarnings()).toStrictEqual([]);
  });
});
