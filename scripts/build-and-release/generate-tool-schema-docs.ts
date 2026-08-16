#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STANDARD_TOOL_DEFS } from "#src/mcp-server/create-mcp-server.ts";
import { NOTATIONS } from "#src/shared/notation.ts";
import { toolDefLiveApi } from "#src/tools/advanced/live-api.def.ts";
import { type ToolDefFunction } from "#src/tools/shared/tool-framework/define-tool.ts";
import {
  generateNotationParamsPartial,
  generateToolPartial,
} from "./helpers/tool-schema-doc-partials.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "../..");
const OUTPUT_DIR = path.join(PROJECT_ROOT, "docs/_generated");

/**
 * Generates tool schema documentation partials for the docs site
 */
async function main(): Promise<void> {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  let count = 0;

  // Standard tools plus the opt-in ppal-live-api tool, which is documented in
  // the tool reference even though it isn't part of the default toolset.
  const allToolDefs: ToolDefFunction[] = [
    ...STANDARD_TOOL_DEFS,
    toolDefLiveApi,
  ];

  for (const toolDef of allToolDefs) {
    const content = generateToolPartial(toolDef);
    const filename = `${toolDef.toolName}-schema.md`;

    await fs.writeFile(path.join(OUTPUT_DIR, filename), content);
    count++;
  }

  // The per-tool tables above resolve at the default notation (bar|beat), so the
  // MIDI Notation page embeds one of these per notation to show how the
  // notation-keyed params actually read under each.
  for (const notation of NOTATIONS) {
    const content = generateNotationParamsPartial(allToolDefs, notation);

    await fs.writeFile(
      path.join(OUTPUT_DIR, `notation-params-${notation}.md`),
      content,
    );
    count++;
  }

  console.log(`Generated ${count} doc partials in docs/_generated/`);
}

await main();
