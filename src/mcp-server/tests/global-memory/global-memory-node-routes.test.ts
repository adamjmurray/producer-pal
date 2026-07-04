// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import Max from "max-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerGlobalMemoryNodeRoutes } from "#src/mcp-server/helpers/memory/global-memory-node-routes.ts";
import { rememberMemory } from "#src/mcp-server/helpers/memory/global-memory-store.ts";
import {
  clearNodeRoutes,
  handleNodeRequest,
} from "#src/mcp-server/rpc/node-request-protocol.ts";
import { MAX_ERROR_DELIMITER } from "#src/shared/mcp-response-utils.ts";
import { useTempConfigDir } from "../config-dir-test-helpers.ts";

vi.mock(import("#src/mcp-server/node-for-max-logger.ts"), () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

type ParsedNodeResponse = {
  success: boolean;
  result?: { content?: string };
  error?: string;
};

/**
 * Reassemble and parse the response JSON from the chunked Max.outlet call.
 * @returns Parsed response object
 */
function parseSentResponse(): ParsedNodeResponse {
  const [name, , ...rest] = vi.mocked(Max.outlet).mock.calls[0] ?? [];

  expect(name).toBe("node_response");

  const delimiterIndex = rest.indexOf(MAX_ERROR_DELIMITER);
  const chunks = rest.slice(0, delimiterIndex) as string[];

  return JSON.parse(chunks.join("")) as ParsedNodeResponse;
}

/**
 * Dispatch a memory route and return the parsed response.
 * @param route - The route name (e.g. "memory.read")
 * @param args - The route args
 * @returns Parsed response object
 */
async function callRoute(
  route: string,
  args: unknown,
): Promise<ParsedNodeResponse> {
  await handleNodeRequest("id", JSON.stringify({ route, args }));

  return parseSentResponse();
}

useTempConfigDir();

beforeEach(() => {
  vi.clearAllMocks();
  registerGlobalMemoryNodeRoutes();
});

afterEach(() => {
  clearNodeRoutes();
});

describe("memory.remember route", () => {
  it("stores a memory and echoes the regenerated index", async () => {
    const response = await callRoute("memory.remember", {
      name: "Prefers C Minor",
      type: "user",
      description: "default key",
      content: "Composes in C minor.",
    });

    expect(response.success).toBe(true);
    expect(response.result?.content).toContain('Remembered "prefers-c-minor".');
    expect(response.result?.content).toContain("## User");
    expect(response.result?.content).toContain(
      "- `prefers-c-minor` — default key",
    );
  });

  it("stores a memory with no description (index line has no dash)", async () => {
    const response = await callRoute("memory.remember", {
      name: "bare",
      type: "user",
      content: "a fact",
    });

    expect(response.success).toBe(true);
    expect(response.result?.content).toContain("- `bare`\n");
  });

  it("fails on an invalid type", async () => {
    const response = await callRoute("memory.remember", {
      name: "x",
      type: "bogus",
      content: "y",
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain("type must be one of");
  });

  it("fails when a required string field is missing", async () => {
    const response = await callRoute("memory.remember", {
      type: "user",
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
      type: "reference",
      description: "analog",
      body: "In ~/Samples/Analog.",
    });

    const response = await callRoute("memory.read", { name: "kick-samples" });

    expect(response.result).toStrictEqual({ content: "In ~/Samples/Analog." });
  });

  it("returns a not-found note for a missing memory", async () => {
    const response = await callRoute("memory.read", { name: "ghost" });

    expect(response.result).toStrictEqual({
      content: 'No memory found for "ghost".',
    });
  });
});

describe("memory.forget route", () => {
  it("removes an existing memory", async () => {
    rememberMemory({ name: "temp", type: "user", description: "", body: "b" });

    const response = await callRoute("memory.forget", { name: "temp" });

    expect(response.result?.content).toContain('Forgot "temp".');
    expect(response.result?.content).toContain("(no memories stored)");
  });

  it("reports when there was nothing to forget", async () => {
    const response = await callRoute("memory.forget", { name: "ghost" });

    expect(response.result?.content).toContain(
      'No memory to forget for "ghost".',
    );
  });
});

describe("memory.list route", () => {
  it("returns a placeholder when empty", async () => {
    const response = await callRoute("memory.list", {});

    expect(response.result).toStrictEqual({ content: "(no memories stored)" });
  });

  it("returns the derived index when populated", async () => {
    rememberMemory({ name: "u", type: "user", description: "hook", body: "b" });

    const response = await callRoute("memory.list", {});

    expect(response.result?.content).toContain("# Producer Pal Memory");
    expect(response.result?.content).toContain("- `u` — hook");
  });
});
