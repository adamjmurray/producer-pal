// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { toJsonSchemaCompat } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import {
  type CallToolResult,
  type ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { STANDARD_TOOL_DEFS } from "#src/mcp-server/create-mcp-server.ts";
import { buildFallbackTools } from "#src/portal/fallback-tools.ts";
import { type Notation } from "#src/shared/notation.ts";
import { connectMcpClient as connect } from "#src/mcp-server/tests/server/mcp-client-test-helpers.ts";
import { toolDefLiveApi } from "#src/tools/advanced/live-api.def.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";

// The MCP SDK parses args against the published schema, coercing them, before
// our handler runs. These go through a real client and server so a null or
// blank is seen exactly as a client sends it.

const PROFILES: { smallModelMode?: boolean; notation?: Notation }[] = [
  {},
  { smallModelMode: true },
  { notation: "midi-json" },
  { notation: "stark" },
];

const TOOL_DEFS = [...STANDARD_TOOL_DEFS, toolDefLiveApi];

type Profile = (typeof PROFILES)[number];

/**
 * The JSON Schema each tool published before its params were wrapped: the
 * plain published params in a loose object.
 * @param name - Tool name
 * @param profile - Server options
 * @returns The params object as authored
 */
function authoredSchema(name: string, profile: Profile): z.ZodObject {
  const def = TOOL_DEFS.find((d) => d.toolName === name);

  if (def == null) {
    throw new Error(`no tool def for ${name}`);
  }

  const { published } = resolveToolSchema(def.toolOptions.inputSchema, profile);

  return z.object(published).loose();
}

/**
 * Call a tool and return the args the Live API received, if it was called.
 * @param args - Tool args
 * @param name - Tool name
 * @returns The tool result and the args the handler forwarded
 */
async function call(
  name: string,
  args: Record<string, unknown>,
): Promise<{ result: CallToolResult; forwarded: unknown }> {
  const { client, callLiveApi } = await connect();
  const result = (await client.callTool({
    name,
    arguments: args,
  })) as CallToolResult;

  await client.close();

  return { result, forwarded: callLiveApi.mock.calls[0]?.[1] };
}

/**
 * @param result - A tool result
 * @returns Its text content, joined
 */
function text(result: CallToolResult): string {
  return result.content
    .map((part) => (part.type === "text" ? part.text : ""))
    .join("\n");
}

describe("empty params over MCP", () => {
  it("reads null on a coerced string param as omitted, not 'null'", async () => {
    const { forwarded } = await call("ppal-update-track", {
      path: "t5",
      inputRoutingType: null,
      name: null,
    });
    const { forwarded: omitted } = await call("ppal-update-track", {
      path: "t5",
    });

    expect(forwarded).not.toHaveProperty("inputRoutingType");
    expect(forwarded).not.toHaveProperty("name");
    expect(forwarded).toStrictEqual(omitted);
  });

  it("refuses a blank on a number param instead of reading it as 0", async () => {
    const { result, forwarded } = await call("ppal-update-scene", {
      path: "s7",
      tempo: "",
    });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe(
      "tempo: a blank string is not a value for this param. Leave it out instead.",
    );
    expect(forwarded).toBeUndefined();
  });

  it("reads null on a min(1) number param as omitted, so its default applies", async () => {
    const { result, forwarded } = await call("ppal-duplicate", {
      type: "scene",
      path: "s7",
      count: null,
    });
    const { forwarded: omitted } = await call("ppal-duplicate", {
      type: "scene",
      path: "s7",
    });

    expect(result.isError).toBeUndefined();
    expect(forwarded).toStrictEqual(omitted);
    expect(forwarded).toHaveProperty("count", 1);
  });

  it("keeps a blank on a text param, where it clears the name", async () => {
    const { forwarded } = await call("ppal-update-track", {
      path: "t5",
      name: "",
    });

    expect(forwarded).toHaveProperty("name", "");
  });

  it("still refuses a value the param can't hold, naming the param", async () => {
    const { result, forwarded } = await call("ppal-duplicate", {
      type: "banana",
      path: "s7",
    });

    expect(result.isError).toBe(true);
    expect(text(result)).toContain("Invalid arguments for tool ppal-duplicate");
    expect(text(result)).toMatch(/at type$/m);
    expect(forwarded).toBeUndefined();
  });
});

describe("published JSON Schema", () => {
  it.each(PROFILES)(
    "tools/list is what the authored params publish (%o)",
    async (profile) => {
      const { client, received } = await connect(profile);

      await client.listTools();
      await client.close();

      const { tools } = (received.at(-1) as { result: ListToolsResult }).result;

      expect(tools.length).toBeGreaterThanOrEqual(STANDARD_TOOL_DEFS.length);
      // The SDK's own converter, with the options it uses for tools/list.
      expect(schemaTexts(tools)).toStrictEqual(
        schemaTexts(tools, (name) =>
          toJsonSchemaCompat(authoredSchema(name, profile), {
            strictUnions: true,
            pipeStrategy: "input",
          }),
        ),
      );
    },
  );

  it.each(PROFILES)(
    "the portal's offline list is unchanged too (%o)",
    (profile) => {
      const { tools } = buildFallbackTools({
        ...profile,
        liveApiEnabled: true,
      });

      expect(schemaTexts(tools)).toStrictEqual(
        schemaTexts(tools, (name) =>
          z.toJSONSchema(authoredSchema(name, profile)),
        ),
      );
    },
  );
});

/**
 * Each tool's JSON Schema as text, so key order counts.
 * @param tools - Listed tools
 * @param schemaFor - Where to take each schema from; defaults to the listing
 * @returns The schema text, per tool name
 */
function schemaTexts(
  tools: { name: string; inputSchema: object }[],
  schemaFor: (name: string) => object = (name) =>
    tools.find((tool) => tool.name === name)?.inputSchema ?? {},
): Record<string, string> {
  return Object.fromEntries(
    tools.map((tool) => [tool.name, JSON.stringify(schemaFor(tool.name))]),
  );
}
