// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Runs one example call the way a real request does: validate the arguments
// against the tool's own schema, then dispatch through the V8 adapter. Every
// module here is imported dynamically because the mock Live API has to be in
// place first — see live-api.ts.

import { z } from "zod";
import { type ToolDefFunction } from "#src/tools/shared/tool-framework/define-tool.ts";
import { type ToolExample } from "./calls.ts";
import { appendedConnectBlocks } from "./connect-blocks.ts";
import { takeWarnings } from "./live-api.ts";

export interface ExampleRun {
  example: ToolExample;
  /** What the tool returned, or undefined when it threw */
  output?: unknown;
  /** Warnings the tool appended to the response */
  warnings: string[];
  /** Extra text blocks the Node side appends — ppal-connect only */
  appended?: string[];
  error?: string;
}

export interface ExampleRunner {
  run: (example: ToolExample) => Promise<ExampleRun>;
  toolNames: string[];
}

/**
 * Load the tool defs and the V8 dispatch, and build the example Live Set.
 * @returns A runner bound to that Live Set, plus every documented tool name
 */
export async function createExampleRunner(): Promise<ExampleRunner> {
  const { STANDARD_TOOL_DEFS } =
    await import("#src/mcp-server/create-mcp-server.ts");
  const { toolDefLiveApi } =
    await import("#src/tools/advanced/live-api.def.ts");
  const { resolveToolSchema } =
    await import("#src/tools/shared/tool-framework/resolve-tool-schema.ts");
  const { callTool } =
    await import("#src/live-api-adapter/live-api-adapter.ts");
  const { beginLiveApiScope, endLiveApiScope, resetLiveApiTracking } =
    await import("#src/live-api-adapter/live-api-release.ts");
  const { clearMockRegistry, simulateMockDeletes } =
    await import("#src/test/mocks/mock-registry.ts");
  const { buildExampleLiveSet } = await import("./live-set.ts");

  const defs = new Map<string, ToolDefFunction>(
    [...STANDARD_TOOL_DEFS, toolDefLiveApi].map((def) => [def.toolName, def]),
  );

  const run = async (example: ToolExample): Promise<ExampleRun> => {
    // A create or duplicate example really does add objects to the fixture, so
    // each example gets its own Live Set and none of them sees the last one's
    // edits.
    clearMockRegistry();
    resetLiveApiTracking();
    buildExampleLiveSet();
    // Deletes have to actually remove the object, or ppal-delete documents
    // itself failing: it verifies a delete landed by looking the id up again,
    // and a mock that keeps the object makes every delete report
    // `deleted: false`. Safe here where it isn't in the shared tests, because
    // each example rebuilds the Live Set above.
    simulateMockDeletes();

    const def = defs.get(example.toolName);

    if (def == null) {
      return {
        example,
        warnings: [],
        error: `no tool named ${example.toolName}`,
      };
    }

    const { validating } = resolveToolSchema(def.toolOptions.inputSchema, {});

    takeWarnings();
    beginLiveApiScope();

    try {
      const args = z.object(validating).parse(example.args);
      const context = exampleContext();
      const output = await callTool(example.toolName, args, context);
      const appended =
        example.toolName === "ppal-connect"
          ? await appendedConnectBlocks(output, context.projectContext.content)
          : undefined;

      return { example, output, appended, warnings: takeWarnings() };
    } catch (error) {
      return {
        example,
        warnings: takeWarnings(),
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      endLiveApiScope();
    }
  };

  return { run, toolNames: [...defs.keys()] };
}

function exampleContext(): ToolContext {
  return {
    projectContext: {
      content: "Downtempo sketch in F minor. Keep the drums sparse.",
    },
    smallModelMode: false,
    sampleFolder: null,
  };
}
