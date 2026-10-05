// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it, vi } from "vitest";
import { TransformArgError } from "#src/notation/transform/helpers/note-ops/transform-arg-errors.ts";
import { tryParseTransform } from "#src/notation/transform/transform-evaluator.ts";

const checkNoteOpArgs = vi.hoisted(() => vi.fn());

// No check throws a TransformArgError today, so a stand-in check does.
vi.mock(
  import("#src/notation/transform/helpers/note-ops/note-op-arg-checks.ts"),
  async (importOriginal) => ({ ...(await importOriginal()), checkNoteOpArgs }),
);

describe("checkTransformArgs error tagging", () => {
  it("passes a TransformArgError through as is", () => {
    const error = new TransformArgError("already tagged");

    checkNoteOpArgs.mockImplementation(() => {
      throw error;
    });

    let thrown: unknown;

    try {
      tryParseTransform("ratchet(2)", 4, 4);
    } catch (caught) {
      thrown = caught;
    }

    expect(thrown).toBe(error);
  });

  it("tags any other error as a TransformArgError", () => {
    checkNoteOpArgs.mockImplementation(() => {
      throw new Error("plain");
    });

    const parse = (): unknown => tryParseTransform("ratchet(2)", 4, 4);

    expect(parse).toThrow(TransformArgError);
    expect(parse).toThrow("plain");
  });
});
