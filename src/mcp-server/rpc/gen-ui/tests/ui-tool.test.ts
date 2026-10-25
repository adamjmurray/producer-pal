// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { beforeEach, describe, expect, it } from "vitest";
import { resetHubForTesting } from "../gen-ui-hub.ts";
import { handleUiTool } from "../ui-tool.ts";
import { resetWidgetStoreForTesting } from "../widget-store.ts";

beforeEach(() => {
  resetHubForTesting();
  resetWidgetStoreForTesting();
});

/**
 * @param args - ppal-ui arguments
 * @returns The tool's reply text and whether it was an error
 */
function run(args: Record<string, unknown>): {
  text: string;
  isError: boolean;
} {
  const response = handleUiTool(args);

  return {
    text: response.content[0]?.text ?? "",
    isError: response.isError === true,
  };
}

describe("ppal-ui", () => {
  it("creates, updates, lists and removes", () => {
    const created = run({ action: "create", kind: "clip", ref: "t0/s0" });

    expect(JSON.parse(created.text)).toStrictEqual({
      created: { id: "w1", kind: "clip", ref: "t0/s0" },
    });

    const updated = run({ action: "update", id: "w1", title: "Bass" });

    expect(JSON.parse(updated.text)).toStrictEqual({
      updated: { id: "w1", kind: "clip", ref: "t0/s0", title: "Bass" },
    });

    const listed = run({ action: "list" });

    expect(JSON.parse(listed.text)).toStrictEqual({
      widgets: [{ id: "w1", kind: "clip", ref: "t0/s0", title: "Bass" }],
    });

    const removed = run({ action: "remove", id: "w1" });

    expect(JSON.parse(removed.text)).toStrictEqual({
      removed: { id: "w1", kind: "clip", ref: "t0/s0", title: "Bass" },
    });
    expect(JSON.parse(run({ action: "list" }).text)).toStrictEqual({
      widgets: [],
    });
  });

  it.each([
    [{ action: "create", kind: "clip" }, "needs a ref"],
    [{ action: "update" }, "update needs the widget's id"],
    [{ action: "remove", id: "" }, "remove needs the widget's id"],
    [{ action: "remove", id: "w9" }, 'No widget with id "w9"'],
    [{ action: "update", id: "w9", title: "x" }, 'No widget with id "w9"'],
    [{ action: "explode" }, 'Unknown action "explode"'],
  ])("answers %j with a tool error", (args, message) => {
    const reply = run(args);

    expect(reply.isError).toBe(true);
    expect(reply.text).toContain(message);
  });
});
