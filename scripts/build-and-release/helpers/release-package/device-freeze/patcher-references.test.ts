// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import {
  listPatcherReferences,
  type PatcherBox,
} from "./patcher-references.ts";

const none = (): boolean => false;

// Wrap boxes the way Max's JSON does.
function patcher(...boxes: PatcherBox[]): { boxes: { box: PatcherBox }[] } {
  return { boxes: boxes.map((box) => ({ box })) };
}

describe("listPatcherReferences", () => {
  it("finds images, bpatchers and script arguments", () => {
    const result = listPatcherReferences(
      patcher(
        { maxclass: "fpic", pic: "logo.svg" },
        { maxclass: "bpatcher", name: "tab.maxpat" },
        { maxclass: "newobj", text: "v8 ./adapter.js", filename: "adapter.js" },
        { maxclass: "newobj", text: "node.script ./server.mjs @watch 1" },
      ),
      none,
    );

    expect(result).toStrictEqual([
      { name: "server.mjs", nodeScript: true },
      { name: "adapter.js", nodeScript: false },
      { name: "tab.maxpat", nodeScript: false },
      { name: "logo.svg", nodeScript: false },
    ]);
  });

  it("lists the last box first and puts a subpatcher after its box", () => {
    const result = listPatcherReferences(
      patcher(
        { maxclass: "fpic", pic: "first.svg" },
        {
          maxclass: "newobj",
          text: "p sub",
          patcher: patcher({ pic: "in.svg" }),
        },
        { maxclass: "fpic", pic: "last.svg" },
      ),
      none,
    );

    expect(result.map((r) => r.name)).toStrictEqual([
      "last.svg",
      "in.svg",
      "first.svg",
    ]);
  });

  it("ignores empty names, flags without a file and plain text", () => {
    const result = listPatcherReferences(
      patcher(
        { maxclass: "bpatcher", name: "" },
        { maxclass: "newobj", text: "node.script @watch 1" },
        { maxclass: "newobj", text: "v8" },
        { maxclass: "newobj", text: "" },
        { maxclass: "newobj" },
        { maxclass: "comment", text: "v8 notes.js" },
        { maxclass: "live.tab", name: "not-a-file" },
      ),
      none,
    );

    expect(result).toStrictEqual([]);
  });

  it("finds abstractions only when the patcher file exists", () => {
    const exists = (name: string): boolean => name === "tool.maxpat";
    const result = listPatcherReferences(
      patcher(
        { maxclass: "newobj", text: "tool 1 2" },
        { maxclass: "newobj", text: "route 1" },
      ),
      exists,
    );

    expect(result).toStrictEqual([{ name: "tool.maxpat", nodeScript: false }]);
  });

  it("lists a file once per box", () => {
    const result = listPatcherReferences(
      patcher({ maxclass: "newobj", text: "v8 a.js", filename: "a.js" }),
      none,
    );

    expect(result).toHaveLength(1);
  });

  it("handles a patcher with no boxes", () => {
    expect(listPatcherReferences({}, none)).toStrictEqual([]);
  });
});
