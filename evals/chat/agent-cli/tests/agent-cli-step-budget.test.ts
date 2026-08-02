// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { CODEX_CLI_TRANSPORT } from "../../codex/codex-cli-protocol.ts";
import { createStepBudgetWatcher } from "../agent-cli-step-budget.ts";

/** One completed MCP call, as the watcher sees it on stdout. */
const CALL_LINE = `${JSON.stringify({
  type: "item.completed",
  item: { type: "mcp_tool_call", tool: "ppal-read-song" },
})}\n`;

describe("createStepBudgetWatcher", () => {
  it("reports only once the turn goes past its budget", () => {
    const watcher = createStepBudgetWatcher(CODEX_CLI_TRANSPORT, 2);

    expect(watcher.push(CALL_LINE)).toBe(false);
    expect(watcher.push(CALL_LINE)).toBe(false);
    expect(watcher.push(CALL_LINE)).toBe(true);
  });

  it("counts a line split across chunks once, when it completes", () => {
    const watcher = createStepBudgetWatcher(CODEX_CLI_TRANSPORT, 0);
    const half = Math.floor(CALL_LINE.length / 2);

    expect(watcher.push(CALL_LINE.slice(0, half))).toBe(false);
    expect(watcher.push(CALL_LINE.slice(half))).toBe(true);
  });

  it("ignores diagnostics the CLI writes between events", () => {
    const watcher = createStepBudgetWatcher(CODEX_CLI_TRANSPORT, 0);

    expect(watcher.push("not json at all\n\n")).toBe(false);
  });
});
