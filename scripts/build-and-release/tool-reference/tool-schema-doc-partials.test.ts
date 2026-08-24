// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { STANDARD_TOOL_DEFS } from "#src/mcp-server/create-mcp-server.ts";
import { NOTATIONS } from "#src/shared/notation.ts";
import {
  defineTool,
  type ToolDefFunction,
} from "#src/tools/shared/tool-framework/define-tool.ts";
import { deprecatedParam } from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";
import {
  generateNotationParamsPartial,
  generateToolPartial,
} from "./tool-schema-doc-partials.ts";

// docs/_generated/ and docs/public/markdown/ are both gitignored, so these
// assert on what the generator produces rather than on files on disk.

/**
 * Look up a real tool definition by name.
 * @param toolName - Tool to look up
 * @returns Its definition
 */
function toolDef(toolName: string): ToolDefFunction {
  const def = STANDARD_TOOL_DEFS.find(
    (td: ToolDefFunction) => td.toolName === toolName,
  );

  expect(def, `tool ${toolName} not found`).toBeDefined();

  return def as ToolDefFunction;
}

describe("generateToolPartial", () => {
  // The docs are read by models, so a retired param name must not reappear
  // there — reverting the published-schema read used to leave the suite green.
  it("documents toPath and leaves the param it replaced out", () => {
    for (const toolName of ["ppal-duplicate", "ppal-update-clip"]) {
      const markdown = generateToolPartial(toolDef(toolName));

      expect(markdown).toContain("`toPath`");
      expect(markdown).not.toContain("toSlot");
    }
  });

  it("marks a param small-model mode hides", () => {
    const markdown = generateToolPartial(toolDef("ppal-update-clip"));

    expect(markdown).toContain("`arrangementSplit` 🐘");
  });
});

describe("generateNotationParamsPartial", () => {
  // A param can be both deprecated and notation-keyed; without reading the
  // published schema, this table republishes the retired name.
  const deprecatedNotationTool = defineTool("ppal-fake", {
    title: "Fake",
    description: "fake tool",
    inputSchema: {
      oldNotes: deprecatedParam(
        param(z.string().optional(), {
          default: "old notes",
          stark: "old notes, stark flavored",
        }),
        { replacedBy: "notes" },
      ),
    },
  });

  it("leaves a deprecated notation-keyed param out of every notation table", () => {
    for (const notation of NOTATIONS) {
      const markdown = generateNotationParamsPartial(
        [deprecatedNotationTool],
        notation,
      );

      expect(markdown).not.toContain("oldNotes");
    }
  });

  it("shows a published param's text for the notation asked for", () => {
    const createClip = [toolDef("ppal-create-clip")];

    expect(generateNotationParamsPartial(createClip, "stark")).toContain(
      "MIDI notes in stark notation",
    );
    expect(generateNotationParamsPartial(createClip, "barbeat")).toContain(
      "MIDI in bar\\|beat notation",
    );
  });
});
