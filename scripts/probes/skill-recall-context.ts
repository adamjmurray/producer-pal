// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Rebuilds what a real session puts in front of the model: the assembled skills
 * blob AND the published tool schemas.
 *
 * Both are context the model has to recall from, and both are ours to edit, so
 * a probe should be able to aim at either. The schemas come through
 * `resolveToolSchema` — the one place that answers "what does the model
 * actually get" — so hidden params and per-mode description overrides are
 * applied exactly as the MCP server applies them.
 */

import { type ToolSet, tool } from "ai";
import { z } from "zod";
import { STANDARD_TOOL_DEFS } from "#src/mcp-server/create-mcp-server.ts";
import { type Notation } from "#src/shared/notation.ts";
import { buildSkills } from "#src/skills/build-skills.ts";
import { resolveModalDescription } from "#src/tools/shared/tool-framework/modal-config.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";

export interface ProbeContext {
  /** The assembled skills blob, as ppal-connect would return it. */
  skills: string;
  /** Published tool schemas, as the MCP client would advertise them. */
  tools: ToolSet;
}

/**
 * Build the skills blob and tool set for one mode.
 *
 * @param options - Notation and small-model mode to assemble for
 * @param options.notation - Notation setting (defaults to bar|beat)
 * @param options.smallModelMode - Whether to build the basic/small-model tier
 * @returns The skills string and the published tool set
 */
export function buildProbeContext(options: {
  notation?: Notation;
  smallModelMode?: boolean;
}): ProbeContext {
  const { notation, smallModelMode = false } = options;
  const context = { smallModelMode, ...(notation != null ? { notation } : {}) };
  const tools: ToolSet = {};

  for (const toolDef of STANDARD_TOOL_DEFS) {
    const { description, inputSchema } = toolDef.toolOptions;
    const { published } = resolveToolSchema(inputSchema, context);

    tools[toolDef.toolName] = tool({
      description: resolveModalDescription(description, context),
      inputSchema: z.object(published),
    });
  }

  return {
    skills: buildSkills({
      smallModelMode,
      ...(notation != null ? { notation } : {}),
    }),
    tools,
  };
}
