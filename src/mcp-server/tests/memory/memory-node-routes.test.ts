// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerMemoryNodeRoutes } from "#src/mcp-server/helpers/memory/memory-node-routes.ts";
import { rememberMemory } from "#src/mcp-server/helpers/memory/memory-store.ts";
import { clearNodeRoutes } from "#src/mcp-server/rpc/node-request-protocol.ts";
import {
  dispatchNodeRoute,
  useTempConfigDir,
} from "../config-dir-test-helpers.ts";

vi.mock(import("#src/mcp-server/node-for-max-logger.ts"), () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
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

describe("memory.read route", () => {
  it("returns the stored body", async () => {
    rememberMemory({
      name: "kick-samples",
      description: "analog",
      body: "In ~/Samples/Analog.",
    });

    const response = await dispatchNodeRoute("memory.read", {
      name: "kick-samples",
    });

    expect(response.result).toStrictEqual({ content: "In ~/Samples/Analog." });
  });

  it("returns a not-found note for a missing memory", async () => {
    const response = await dispatchNodeRoute("memory.read", { name: "ghost" });

    expect(response.result).toStrictEqual({
      content: 'No memory found for "ghost".',
    });
  });
});

describe("memory.forget route", () => {
  it("removes an existing memory", async () => {
    rememberMemory({ name: "temp", description: "d", body: "b" });

    const response = await dispatchNodeRoute("memory.forget", { name: "temp" });

    expect(response.result?.content).toContain('Deleted memory "temp".');
    expect(response.result?.content).toContain("(no memories stored)");
  });

  it("reports when there was nothing to delete", async () => {
    const response = await dispatchNodeRoute("memory.forget", {
      name: "ghost",
    });

    expect(response.result?.content).toContain(
      'No memory named "ghost" to delete.',
    );
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
