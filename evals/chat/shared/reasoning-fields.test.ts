// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { reasoningFields } from "./reasoning-fields.ts";

describe("reasoningFields", () => {
  it("passes both fields through", () => {
    expect(
      reasoningFields({ reasoningText: "hmm", finishReason: "stop" }),
    ).toStrictEqual({ reasoningText: "hmm", finishReason: "stop" });
  });

  it("leaves out a field the turn lacks", () => {
    expect(reasoningFields({ finishReason: "length" })).toStrictEqual({
      finishReason: "length",
    });
    expect(reasoningFields({ reasoningText: "hmm" })).toStrictEqual({
      reasoningText: "hmm",
    });
    expect(reasoningFields({})).toStrictEqual({});
  });

  it("treats an empty string as absent", () => {
    expect(
      reasoningFields({ reasoningText: "", finishReason: "" }),
    ).toStrictEqual({});
  });
});
