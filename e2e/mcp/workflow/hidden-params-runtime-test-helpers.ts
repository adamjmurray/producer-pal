// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// What the tool schemas say about hidden params, for the suite that calls every
// one of them for real.

import { STANDARD_TOOL_DEFS } from "#src/mcp-server/create-mcp-server.ts";
import {
  hiddenParamWarnings,
  type HiddenParamInfo,
} from "#src/tools/shared/tool-framework/hidden-param.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";

/**
 * The hidden params each tool declares, keyed by tool name.
 * @returns Hidden-param info per tool
 */
export function hiddenByTool(): Record<
  string,
  Record<string, HiddenParamInfo>
> {
  return Object.fromEntries(
    STANDARD_TOOL_DEFS.map((def) => [
      def.toolName,
      resolveToolSchema(def.toolOptions.inputSchema, {}).hidden,
    ]),
  );
}

/**
 * The warnings the framework produces for a call. Aliases that fold onto the
 * same param are grouped into one line, so this is built from every hidden
 * param the call actually sent, not from the one under test.
 * @param tool - Tool name, for the hidden-param lookup
 * @param args - The arguments the call sent
 * @returns The expected warning texts
 */
export function expectedWarnings(
  tool: string,
  args: Record<string, unknown>,
): string[] {
  const hidden = hiddenByTool()[tool] ?? {};
  const used = Object.keys(hidden).filter((key) => key in args);

  return hiddenParamWarnings(used, hidden);
}
