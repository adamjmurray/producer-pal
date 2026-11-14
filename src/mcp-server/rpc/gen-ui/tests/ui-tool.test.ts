// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setClipResolverForTesting } from "../clip-ref.ts";
import { resetHubForTesting } from "../gen-ui-hub.ts";
import { handleUiTool } from "../ui-tool.ts";
import { resetWidgetStoreForTesting } from "../widget-store.ts";

beforeEach(() => {
  resetHubForTesting();
  resetWidgetStoreForTesting();
  // Slots t0/s0 and t1/s1 hold clips; clip 12 is in t1/s1.
  setClipResolverForTesting((ref) => {
    const path = ref === "12" ? "t1/s1" : ref;

    return Promise.resolve(
      ["t0/s0", "t1/s1"].includes(path)
        ? { ok: true, path }
        : { ok: false, error: `No clip at ${ref}: empty` },
    );
  });
});

afterEach(() => {
  setClipResolverForTesting(null);
});

/**
 * @param args - ppal-ui arguments
 * @returns The tool's reply text and whether it was an error
 */
async function run(
  args: Record<string, unknown>,
): Promise<{ text: string; isError: boolean }> {
  const response = await handleUiTool(args);

  return {
    text: response.content[0]?.text ?? "",
    isError: response.isError === true,
  };
}

describe("ppal-ui", () => {
  it("creates, updates, lists and removes", async () => {
    const created = await run({ action: "create", kind: "clip", ref: "t0/s0" });

    expect(JSON.parse(created.text)).toStrictEqual({
      created: { id: "w1", kind: "clip", ref: "t0/s0" },
    });

    const updated = await run({ action: "update", id: "w1", title: "Bass" });

    expect(JSON.parse(updated.text)).toStrictEqual({
      updated: { id: "w1", kind: "clip", ref: "t0/s0", title: "Bass" },
    });

    const listed = await run({ action: "list" });

    expect(JSON.parse(listed.text)).toStrictEqual({
      widgets: [{ id: "w1", kind: "clip", ref: "t0/s0", title: "Bass" }],
    });

    const removed = await run({ action: "remove", id: "w1" });

    expect(JSON.parse(removed.text)).toStrictEqual({
      removed: { id: "w1", kind: "clip", ref: "t0/s0", title: "Bass" },
    });
    const listedAfter = await run({ action: "list" });

    expect(JSON.parse(listedAfter.text)).toStrictEqual({ widgets: [] });
  });

  it("stores the path of a clip given by id", async () => {
    const created = await run({ action: "create", kind: "clip", ref: "12" });

    expect(JSON.parse(created.text)).toStrictEqual({
      created: { id: "w1", kind: "clip", ref: "t1/s1" },
    });
  });

  it("refuses a widget for a slot with no clip, and creates nothing", async () => {
    const reply = await run({ action: "create", kind: "clip", ref: "t5/s5" });

    expect(reply.isError).toBe(true);
    expect(reply.text).toBe("No clip at t5/s5: empty");

    const listed = await run({ action: "list" });

    expect(JSON.parse(listed.text)).toStrictEqual({ widgets: [] });
  });

  it("checks a new ref on update too, and leaves the widget as it was", async () => {
    await run({ action: "create", kind: "clip", ref: "t0/s0" });

    const refused = await run({ action: "update", id: "w1", ref: "t7/s7" });
    const moved = await run({ action: "update", id: "w1", ref: "12" });

    expect(refused.isError).toBe(true);
    expect(JSON.parse(moved.text)).toStrictEqual({
      updated: { id: "w1", kind: "clip", ref: "t1/s1" },
    });
  });

  it.each([
    [{ action: "create", kind: "clip" }, "needs a ref"],
    [{ action: "update" }, "update needs the widget's id"],
    [{ action: "remove", id: "" }, "remove needs the widget's id"],
    [{ action: "remove", id: "w9" }, 'No widget with id "w9"'],
    [{ action: "update", id: "w9", title: "x" }, 'No widget with id "w9"'],
    [{ action: "explode" }, 'Unknown action "explode"'],
  ])("answers %j with a tool error", async (args, message) => {
    const reply = await run(args);

    expect(reply.isError).toBe(true);
    expect(reply.text).toContain(message);
  });
});
