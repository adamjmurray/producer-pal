// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { vi } from "vitest";
import { NOTATIONS, type Notation } from "#src/shared/notation.ts";
import { type ToolDefFunction } from "#src/tools/shared/tool-framework/define-tool.ts";

// The `code` params only exist when this flag is on, and it is read when the
// tool defs load — so stub it before importing them. Importing this module is
// what loads them, which is why the defs live here rather than in each suite.
vi.stubEnv("ENABLE_CODE_EXEC", "true");
const { STANDARD_TOOL_DEFS } =
  await import("#src/mcp-server/create-mcp-server.ts");
const { toolDefLiveApi } = await import("#src/tools/advanced/live-api.def.ts");

vi.unstubAllEnvs();

/** Every published tool def, including the opt-in ones. */
export const TOOL_DEFS: ToolDefFunction[] = [
  ...STANDARD_TOOL_DEFS,
  toolDefLiveApi,
];

/** One published tool, resolved in one (notation, small-model) cell. */
export type ToolDefCase = readonly [
  label: string,
  def: ToolDefFunction,
  context: { notation: Notation; smallModelMode: boolean },
];

// Small-model mode crosses with notation, and a param or enum value can be
// trimmed in one cell only, so every combination gets its own case.
export const TOOL_DEF_CASES: ToolDefCase[] = NOTATIONS.flatMap((notation) =>
  [true, false].flatMap((smallModelMode) =>
    TOOL_DEFS.map(
      (def) =>
        [
          `${def.toolName} (${notation}${smallModelMode ? ", small" : ""})`,
          def,
          { notation, smallModelMode },
        ] as const,
    ),
  ),
);
