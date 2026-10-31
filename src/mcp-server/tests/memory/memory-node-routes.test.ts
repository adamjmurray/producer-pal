// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerMemoryNodeRoutes } from "#src/mcp-server/helpers/memory/memory-node-routes.ts";
import {
  readMemoryEntry,
  rememberMemory,
} from "#src/mcp-server/helpers/memory/memory-store.ts";
import { clearNodeRoutes } from "#src/mcp-server/rpc/node-request-protocol.ts";
import {
  dispatchNodeRoute,
  useTempConfigDir,
} from "../config-dir-test-helpers.ts";

vi.mock(import("#src/mcp-server/node-for-max-logger.ts"), () => ({
  nodeLog: vi.fn(),
  nodeInfo: vi.fn(),
  nodeWarn: vi.fn(),
  nodeError: vi.fn(),
}));

useTempConfigDir();

beforeEach(() => {
  vi.clearAllMocks();
  registerMemoryNodeRoutes();
});

afterEach(() => {
  clearNodeRoutes();
});

describe("memory.remember route", () => {
  it("stores a memory and echoes the regenerated index", async () => {
    const response = await dispatchNodeRoute("memory.remember", {
      name: "Prefers C Minor",
      description: "default key",
      content: "Composes in C minor.",
    });

    expect(response.success).toBe(true);
    expect(response.result?.content).toContain(
      'Saved memory "prefers-c-minor".',
    );
    expect(response.result?.content).toContain(
      "- `prefers-c-minor` — default key",
    );
  });

  it("fails when the description is missing (memory requires one)", async () => {
    const response = await dispatchNodeRoute("memory.remember", {
      name: "bare",
      content: "a fact",
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain("description must not be empty");
  });

  it("fails when a required string field is missing", async () => {
    const response = await dispatchNodeRoute("memory.remember", {
      content: "y",
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain("name must be a string");
  });
});

describe("memory.readMany route", () => {
  it("answers each name in order, a missing one with ok: false", async () => {
    rememberMemory({ name: "a", description: "d", body: "body a" });
    rememberMemory({ name: "b", description: "d", body: "body b" });

    const response = await dispatchNodeRoute("memory.readMany", {
      names: ["b", "ghost", "A", "b"],
    });

    expect(response.result).toStrictEqual({
      entries: [
        { name: "b", content: "body b" },
        { name: "ghost", ok: false, detail: 'No memory found for "ghost".' },
        { name: "A", content: "body a" },
        { name: "b", content: "body b" },
      ],
    });
  });

  it("reports every name missing when none exists", async () => {
    const response = await dispatchNodeRoute("memory.readMany", {
      names: ["x", "y"],
    });

    expect(response.result).toStrictEqual({
      entries: [
        { name: "x", ok: false, detail: 'No memory found for "x".' },
        { name: "y", ok: false, detail: 'No memory found for "y".' },
      ],
    });
  });

  it("fails when names is not an array of strings", async () => {
    const response = await dispatchNodeRoute("memory.readMany", { names: "a" });

    expect(response.success).toBe(false);
    expect(response.error).toContain("names must be an array of strings");
  });
});

describe("memory.forgetMany route", () => {
  it("deletes each name and leaves the rest", async () => {
    rememberMemory({ name: "a", description: "d", body: "x" });
    rememberMemory({ name: "b", description: "d", body: "x" });
    rememberMemory({ name: "keep", description: "d", body: "x" });

    const response = await dispatchNodeRoute("memory.forgetMany", {
      names: ["a", "ghost", "b"],
    });

    expect(response.result).toStrictEqual({
      entries: [
        { name: "a" },
        { name: "ghost", detail: "nothing to delete" },
        { name: "b" },
      ],
    });

    expect(readMemoryEntry("keep")).not.toBeNull();
    expect(readMemoryEntry("a")).toBeNull();
    expect(readMemoryEntry("b")).toBeNull();
  });

  it("deletes a name given twice once, by its last mention", async () => {
    rememberMemory({ name: "dup", description: "d", body: "x" });

    const response = await dispatchNodeRoute("memory.forgetMany", {
      names: ["dup", "Dup", "other"],
    });

    expect(response.result).toStrictEqual({
      entries: [
        { name: "dup", detail: 'named again as "Dup" later in this call' },
        { name: "Dup" },
        { name: "other", detail: "nothing to delete" },
      ],
    });
  });

  it("treats the reserved index name as nothing to delete", async () => {
    const response = await dispatchNodeRoute("memory.forgetMany", {
      names: ["memory", "MEMORY"],
    });

    expect(response.result).toStrictEqual({
      entries: [
        {
          name: "memory",
          detail: 'named again as "MEMORY" later in this call',
        },
        { name: "MEMORY", detail: "nothing to delete" },
      ],
    });
  });

  it("reports every name as nothing to delete when none exists", async () => {
    const response = await dispatchNodeRoute("memory.forgetMany", {
      names: ["!!!", "ghost"],
    });

    expect(response.result).toStrictEqual({
      entries: [
        { name: "!!!", detail: "nothing to delete" },
        { name: "ghost", detail: "nothing to delete" },
      ],
    });
  });
});

describe("memory.list route", () => {
  it("returns a placeholder when empty", async () => {
    const response = await dispatchNodeRoute("memory.list", {});

    expect(response.result).toStrictEqual({ content: "(no memories stored)" });
  });

  it("returns the derived index when populated", async () => {
    rememberMemory({ name: "u", description: "hook", body: "b" });

    const response = await dispatchNodeRoute("memory.list", {});

    expect(response.result?.content).toContain("# Producer Pal Memory");
    expect(response.result?.content).toContain("- `u` — hook");
  });
});
