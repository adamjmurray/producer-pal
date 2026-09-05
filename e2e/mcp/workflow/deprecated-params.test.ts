// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * E2E test for what a hidden param publishes.
 *
 * deprecatedParam() and aliasParam() both keep a param in the schema that
 * validates and out of the schema that ships, so old and guessing callers keep
 * working while the model never learns the hidden name. Unit tests pin the
 * resolved shape; this pins what a live client actually receives, over both
 * catalogs — MCP and REST each build their own, and REST once served a param
 * MCP was hiding.
 *
 * The other half — that the hidden names still work — is
 * hidden-params-runtime.test.ts, which calls every one of them for real.
 *
 * Run with: npm run e2e:mcp -- deprecated-params
 */
import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectMcp, type McpConnection } from "#evals/chat/mcp.ts";
import { MCP_URL } from "../mcp-test-helpers";

interface ToolInfo {
  name: string;
  inputSchema: { properties?: Record<string, unknown> };
}

let connection: McpConnection | null = null;
let client: Client | null = null;
let tools: ToolInfo[] = [];

beforeAll(async () => {
  connection = await connectMcp(MCP_URL);
  client = connection.client;
  tools = (await client.listTools()).tools as ToolInfo[];
});

afterAll(async () => {
  await client?.close();
});

/**
 * Read a published tool's param names.
 * @param toolName - Tool to look up
 * @returns Every param the model is shown
 */
function publishedParams(toolName: string): string[] {
  const tool = tools.find((t) => t.name === toolName);

  expect(tool, `tool ${toolName} not found`).toBeDefined();

  return Object.keys(tool!.inputSchema.properties ?? {});
}

describe("hidden params", () => {
  it("publishes toPath and hides the destination params it replaced", () => {
    const duplicate = publishedParams("ppal-duplicate");

    expect(duplicate).toContain("toPath");
    expect(duplicate).not.toContain("toSlot");
    // toTrack was never released — it existed only between the fix and this
    // unification, so it should be absent everywhere, not merely deprecated.
    expect(duplicate).not.toContain("toTrack");

    const updateClip = publishedParams("ppal-update-clip");

    expect(updateClip).toContain("toPath");
    expect(updateClip).not.toContain("toSlot");
  });

  // Publishing any of these is the bug path fixed: an index-shaped param
  // beside a description naming a track and a scene is what taught models to
  // guess trackIndex/sceneIndex instead of the real param.
  it("publishes path and hides the index params it replaced", () => {
    const createClip = publishedParams("ppal-create-clip");

    expect(createClip).toContain("path");
    expect(createClip).not.toContain("slot");
    expect(createClip).not.toContain("trackIndex");
    expect(createClip).not.toContain("sceneIndex");

    const readClip = publishedParams("ppal-read-clip");

    expect(readClip).toContain("path");
    expect(readClip).not.toContain("slot");

    const select = publishedParams("ppal-select");

    expect(select).toContain("path");
    expect(select).not.toContain("slot");
    expect(select).not.toContain("devicePath");
    expect(select).not.toContain("trackIndex");
    expect(select).not.toContain("trackType");
    expect(select).not.toContain("sceneIndex");

    const readTrack = publishedParams("ppal-read-track");

    expect(readTrack).toContain("path");
    expect(readTrack).not.toContain("trackIndex");
    expect(readTrack).not.toContain("trackType");

    const readScene = publishedParams("ppal-read-scene");

    expect(readScene).toContain("path");
    expect(readScene).not.toContain("sceneIndex");

    const playback = publishedParams("ppal-playback");

    expect(playback).toContain("path");
    expect(playback).not.toContain("slots");
  });

  // A path's [song position] is the published spelling now, so arrangementStart
  // is a second one for the same thing and no model should be shown it.
  it("hides arrangementStart on the three tools that place clips", () => {
    for (const tool of [
      "ppal-create-clip",
      "ppal-update-clip",
      "ppal-duplicate",
    ]) {
      expect(publishedParams(tool)).not.toContain("arrangementStart");
    }

    expect(publishedParams("ppal-create-clip")).toContain("path");
    expect(publishedParams("ppal-update-clip")).toContain("toPath");
    expect(publishedParams("ppal-duplicate")).toContain("toPath");
  });

  // GET /api/tools builds its own catalog, and it is how a REST agent discovers
  // the tool surface — so it has to hide the same names MCP does.
  it("hides them from the REST catalog too", async () => {
    const response = await fetch(MCP_URL.replace("/mcp", "/api/tools"));

    expect(response.ok).toBe(true);

    const { tools: restTools } = (await response.json()) as {
      tools: ToolInfo[];
    };
    const duplicate = restTools.find((t) => t.name === "ppal-duplicate");
    const params = Object.keys(duplicate!.inputSchema.properties ?? {});

    expect(params).toContain("toPath");
    expect(params).not.toContain("toSlot");
  });
});
