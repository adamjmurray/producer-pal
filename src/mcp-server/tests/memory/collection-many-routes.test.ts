// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCollectionNodeRoutes } from "#src/mcp-server/rpc/collection-node-routes.ts";
import { clearNodeRoutes } from "#src/mcp-server/rpc/node-request-protocol.ts";
import { dispatchNodeRoute } from "../config-dir-test-helpers.ts";

vi.mock(import("#src/mcp-server/node-for-max-logger.ts"), () => ({
  nodeLog: vi.fn(),
  nodeInfo: vi.fn(),
  nodeWarn: vi.fn(),
  nodeError: vi.fn(),
}));

// A store whose read and forget throw for the name "bad", to show a throw costs
// only that name's entry.
const forgotten: string[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  forgotten.length = 0;
  makeCollectionNodeRoutes({
    namespace: "fake",
    noun: "thing",
    emptyIndex: "(none)",
    slugify: (name) => name.trim().toLowerCase(),
    read: (name) => {
      if (name === "bad") {
        throw new Error("disk read failed");
      }

      return { name, body: `body ${name}` };
    },
    remember: (input) => ({ name: input.name, body: input.body }),
    forget: (name) => {
      if (name.toLowerCase() === "bad") {
        throw new Error("disk delete failed");
      }

      forgotten.push(name);

      return true;
    },
    regenerateIndex: () => "",
  })();
});

afterEach(() => {
  clearNodeRoutes();
});

describe("fake.readMany route", () => {
  it("reports a throw on the second of three names and reads the rest", async () => {
    const response = await dispatchNodeRoute("fake.readMany", {
      names: ["a", "bad", "c"],
    });

    expect(response.result).toStrictEqual({
      entries: [
        { name: "a", content: "body a" },
        { name: "bad", ok: false, detail: "disk read failed" },
        { name: "c", content: "body c" },
      ],
    });
  });
});

describe("fake.forgetMany route", () => {
  it("keeps earlier deletes and still runs later names after a throw", async () => {
    const response = await dispatchNodeRoute("fake.forgetMany", {
      names: ["a", "bad", "c"],
    });

    expect(response.result).toStrictEqual({
      entries: [
        { name: "a" },
        { name: "bad", ok: false, detail: "disk delete failed" },
        { name: "c" },
      ],
    });
    expect(forgotten).toStrictEqual(["a", "c"]);
  });

  it("fails earlier mentions with the last one when it throws", async () => {
    const response = await dispatchNodeRoute("fake.forgetMany", {
      names: ["bad", "a", "BAD", "Bad"],
    });

    // Only the last mention of "bad" ran; "a" is untouched by the failure.
    expect(response.result).toStrictEqual({
      entries: [
        {
          name: "bad",
          ok: false,
          detail: 'not written: "Bad" was meant to replace it, but failed',
        },
        { name: "a" },
        {
          name: "BAD",
          ok: false,
          detail: 'not written: "Bad" was meant to replace it, but failed',
        },
        { name: "Bad", ok: false, detail: "disk delete failed" },
      ],
    });
  });
});
