// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { type UIPart } from "#webui/types/messages";
import { groupToolParts } from "./group-tool-parts";

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

describe("groupToolParts", () => {
  it("returns empty array for empty input", () => {
    expect(groupToolParts([])).toStrictEqual([]);
  });

  it("keeps fewer than 3 consecutive tools as singles", () => {
    const parts: UIPart[] = [tool("a"), tool("b")];
    const items = groupToolParts(parts);

    expect(items).toHaveLength(2);
    expect(items.every((item) => item.kind === "single")).toBe(true);
  });

  it("groups exactly 3 consecutive tools", () => {
    const parts: UIPart[] = [tool("a"), tool("b"), tool("c")];
    const items = groupToolParts(parts);

    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("tool-group");

    const group = items[0] as { kind: "tool-group"; parts: UIPart[] };

    expect(group.parts).toHaveLength(3);
  });

  it("groups 4+ consecutive tools", () => {
    const parts: UIPart[] = [tool("a"), tool("b"), tool("c"), tool("d")];
    const items = groupToolParts(parts);

    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("tool-group");
  });

  it("step-usage parts between tools do not break the group", () => {
    const parts: UIPart[] = [
      tool("a"),
      stepUsage(),
      tool("b"),
      stepUsage(),
      tool("c"),
    ];
    const items = groupToolParts(parts);

    expect(items).toHaveLength(1);
    expect(items[0]!.kind).toBe("tool-group");

    const group = items[0] as { kind: "tool-group"; parts: UIPart[] };

    // 3 tools + 2 step-usages
    expect(group.parts).toHaveLength(5);
  });

  it("text parts break the group", () => {
    const parts: UIPart[] = [
      tool("a"),
      tool("b"),
      tool("c"),
      text("hello"),
      tool("d"),
      tool("e"),
      tool("f"),
    ];
    const items = groupToolParts(parts);

    expect(items).toHaveLength(3); // group, text, group
    expect(items[0]!.kind).toBe("tool-group");
    expect(items[1]!.kind).toBe("single");
    expect(items[2]!.kind).toBe("tool-group");
  });

  it("preserves original indices", () => {
    const parts: UIPart[] = [text("hi"), tool("a"), tool("b"), tool("c")];
    const items = groupToolParts(parts);

    expect(items).toHaveLength(2);

    const single = items[0] as { kind: "single"; index: number };

    expect(single.index).toBe(0);

    const group = items[1] as { kind: "tool-group"; indices: number[] };

    expect(group.indices).toStrictEqual([1, 2, 3]);
  });

  it("handles mixed content with no grouping needed", () => {
    const parts: UIPart[] = [
      text("start"),
      tool("a"),
      text("mid"),
      tool("b"),
      text("end"),
    ];
    const items = groupToolParts(parts);

    expect(items).toHaveLength(5);
    expect(items.every((item) => item.kind === "single")).toBe(true);
  });

  it("handles step-usage-only run without grouping", () => {
    const parts: UIPart[] = [stepUsage(), stepUsage()];
    const items = groupToolParts(parts);

    expect(items).toHaveLength(2);
    expect(items.every((item) => item.kind === "single")).toBe(true);
  });

  it("includes step-usage indices in group", () => {
    const parts: UIPart[] = [tool("a"), stepUsage(), tool("b"), tool("c")];
    const items = groupToolParts(parts);

    expect(items).toHaveLength(1);

    const group = items[0] as { kind: "tool-group"; indices: number[] };

    expect(group.indices).toStrictEqual([0, 1, 2, 3]);
  });
});
