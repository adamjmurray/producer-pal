// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { describe, expect, it } from "vitest";
import { type EvalAssertion } from "../types.ts";
import { runCorrectnessAssertion } from "./message-turns.ts";

describe("runCorrectnessAssertion", () => {
  it("scores an unknown assertion type as a failure, not a vacuous pass", async () => {
    const assertion = { type: "mystery" } as unknown as EvalAssertion;

    const result = await runCorrectnessAssertion(assertion, [], {} as Client);

    expect(result.maxScore).toBe(1);
    expect(result.earned).toBe(0);
    expect(result.earned === result.maxScore).toBe(false);
    expect(result.message).toContain("Unknown assertion type: mystery");
  });
});
