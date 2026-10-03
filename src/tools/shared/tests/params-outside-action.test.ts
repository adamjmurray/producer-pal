// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it, vi } from "vitest";
import { context } from "#src/tools/core/context.ts";
import { library } from "#src/tools/session/library.ts";
import { playback } from "#src/tools/session/playback.ts";

vi.mock(import("#src/live-api-adapter/node-request-v8-protocol.ts"), () => ({
  requestNode: vi.fn(),
  handleNodeResponse: vi.fn(),
}));

const protocolMock =
  await import("#src/live-api-adapter/node-request-v8-protocol.ts");

type Tool = (args: never, toolContext?: never) => unknown;

// A param that only another action (or scope) reads is refused, in one wording,
// by every tool with actions. The param is `similarTo` on a defaulted action
// first because that is the call that used to return unrelated results with
// nothing said.
const CASES: Array<[string, Tool, object, string]> = [
  ["library, no action", library as Tool, { similarTo: "/a.wav" }, "similarTo"],
  [
    "library, explicit action",
    library as Tool,
    { action: "list-tags", tags: "Kick" },
    "tags",
  ],
  [
    "library, an old alias",
    library as Tool,
    { action: "search", queries: [{ tags: "Kick" }], vendor: "xfer" },
    "vendor",
  ],
  [
    "playback, timeline param on a session action",
    playback as Tool,
    { action: "play-scene", sceneIndex: 3, startTime: "5|1" },
    "startTime",
  ],
  [
    "playback, target param on a transport action",
    playback as Tool,
    { action: "stop", path: "t0/s1" },
    "path",
  ],
  [
    "context, name outside memory",
    context as Tool,
    { action: "write", content: "x", name: "jungle" },
    "name",
  ],
  [
    "context, content on a read",
    context as Tool,
    { action: "read", content: "x" },
    "content",
  ],
  [
    "context, description on a memory read",
    context as Tool,
    { action: "read", scope: "memory", description: "x" },
    "description",
  ],
];

describe("a param that only another action reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(CASES)(
    "is refused up front: %s",
    async (_label, tool, args, param) => {
      await expect((async () => await tool(args as never))()).rejects.toThrow(
        new RegExp(
          `${param}.* only for (action|scope) .*Change the .* or drop`,
        ),
      );

      expect(protocolMock.requestNode).not.toHaveBeenCalled();
      expect(outlet).not.toHaveBeenCalled();
    },
  );
});
