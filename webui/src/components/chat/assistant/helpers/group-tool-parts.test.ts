// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type UIPart } from "#webui/types/messages";
import {
  groupToolParts,
  type RenderItem,
  type SingleRenderItem,
  type ToolGroupRenderItem,
} from "./group-tool-parts";

const tool = (name: string, result: string | null = "ok"): UIPart => ({
  type: "tool",
  name,
  args: {},
  result,
});

const stepUsage = (): UIPart => ({
  type: "step-usage",
  usage: { inputTokens: 100, outputTokens: 50 },
});

const text = (content: string): UIPart => ({ type: "text", content });

/** Narrow the item at `index` to a tool group, failing the test if it isn't. */
const groupAt = (items: RenderItem[], index: number): ToolGroupRenderItem => {
  const item = items[index];

  if (item?.kind !== "tool-group") {
    throw new Error(`items[${index}] is ${item?.kind}, not a tool-group`);
  }

  return item;
};

/** Narrow the item at `index` to a single, failing the test if it isn't. */
const singleAt = (items: RenderItem[], index: number): SingleRenderItem => {
  const item = items[index];

  if (item?.kind !== "single") {
    throw new Error(`items[${index}] is ${item?.kind}, not a single`);
  }

  return item;
};

/** Assert the items' kinds, in order. */
const expectKinds = (
  items: RenderItem[],
  kinds: RenderItem["kind"][],
): void => {
  expect(items.map((item) => item.kind)).toStrictEqual(kinds);
};

/** Assert `items` is exactly `count` items, none of them grouped. */
const expectAllSingles = (items: RenderItem[], count: number): void => {
  expectKinds(items, Array<RenderItem["kind"]>(count).fill("single"));
};

describe("groupToolParts", () => {
  it("returns empty array for empty input", () => {
    expect(groupToolParts([])).toStrictEqual([]);
  });

  it("keeps fewer than 3 consecutive tools as singles", () => {
    const items = groupToolParts([tool("a"), tool("b")]);

    expectAllSingles(items, 2);
  });

  it("groups exactly 3 consecutive tools", () => {
    const items = groupToolParts([tool("a"), tool("b"), tool("c")]);

    expectKinds(items, ["tool-group"]);
    expect(groupAt(items, 0).parts).toHaveLength(3);
  });

  it("groups 4+ consecutive tools", () => {
    const items = groupToolParts([tool("a"), tool("b"), tool("c"), tool("d")]);

    expectKinds(items, ["tool-group"]);
  });

  it("step-usage parts between tools do not break the group", () => {
    const items = groupToolParts([
      tool("a"),
      stepUsage(),
      tool("b"),
      stepUsage(),
      tool("c"),
    ]);

    expectKinds(items, ["tool-group"]);
    // 3 tools + 2 step-usages
    expect(groupAt(items, 0).parts).toHaveLength(5);
  });

  it("text parts break the group", () => {
    const items = groupToolParts([
      tool("a"),
      tool("b"),
      tool("c"),
      text("hello"),
      tool("d"),
      tool("e"),
      tool("f"),
    ]);

    expectKinds(items, ["tool-group", "single", "tool-group"]);
  });

  it("preserves original indices", () => {
    const items = groupToolParts([text("hi"), tool("a"), tool("b"), tool("c")]);

    expectKinds(items, ["single", "tool-group"]);
    expect(singleAt(items, 0).index).toBe(0);
    expect(groupAt(items, 1).indices).toStrictEqual([1, 2, 3]);
  });

  it("handles mixed content with no grouping needed", () => {
    const items = groupToolParts([
      text("start"),
      tool("a"),
      text("mid"),
      tool("b"),
      text("end"),
    ]);

    expectAllSingles(items, 5);
  });

  it("handles step-usage-only run without grouping", () => {
    const items = groupToolParts([stepUsage(), stepUsage()]);

    expectAllSingles(items, 2);
  });

  it("includes step-usage indices in group", () => {
    const items = groupToolParts([
      tool("a"),
      stepUsage(),
      tool("b"),
      tool("c"),
    ]);

    expectKinds(items, ["tool-group"]);
    expect(groupAt(items, 0).indices).toStrictEqual([0, 1, 2, 3]);
  });

  it("never groups spawn_subagent parts (parallel spawns stay individual cards)", () => {
    const items = groupToolParts([
      tool("spawn_subagent"),
      tool("spawn_subagent"),
      tool("spawn_subagent"),
      tool("spawn_subagent"),
    ]);

    expectAllSingles(items, 4);
  });

  it("keeps grouping ordinary tools around subagent parts", () => {
    const items = groupToolParts([
      tool("a"),
      tool("b"),
      tool("c"),
      tool("spawn_subagent"),
      tool("d"),
      tool("e"),
      tool("f"),
    ]);

    // group(a,b,c), single(spawn), group(d,e,f)
    expectKinds(items, ["tool-group", "single", "tool-group"]);
  });
});
