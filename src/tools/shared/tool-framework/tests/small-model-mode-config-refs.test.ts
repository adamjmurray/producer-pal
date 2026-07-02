// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";

// Some params are spread into inputSchema only under a build flag, read at module
// load: `code` (ENABLE_CODE_EXEC) and the warp* params (ENABLE_WARP_MARKERS, set
// globally in vitest.config.ts). excludeParams legitimately lists them as a
// superset, so enable ENABLE_CODE_EXEC here and load the defs via a dynamic
// import (after the env is set) — otherwise those refs would look dangling even
// though they're correct.
vi.stubEnv("ENABLE_CODE_EXEC", "true");

const { STANDARD_TOOL_DEFS } =
  await import("#src/mcp-server/create-mcp-server.ts");
const { toolDefLiveApi } = await import("#src/tools/advanced/live-api.def.ts");

const ALL_TOOL_DEFS = [...STANDARD_TOOL_DEFS, toolDefLiveApi];

// Every smallModelModeConfig / notationConfig key that names a param —
// excludeParams entries and the object keys of descriptionOverrides /
// excludeEnumValues, plus each notation override's descriptionOverrides keys —
// must reference a real inputSchema param. A renamed or removed param leaves a
// dangling reference that silently no-ops (the exclude/override does nothing),
// which AGENTS.md flags as the highest-risk small-model-mode drift and asks
// authors to check by hand on every .def.ts edit. This enforces it
// automatically.
describe("smallModelModeConfig param references", () => {
  // Guard against the flag setup above silently failing — if the conditional
  // params weren't loaded, the per-tool checks could pass vacuously.
  it("loaded the flag-gated conditional params (ENABLE_CODE_EXEC)", () => {
    const createClip = ALL_TOOL_DEFS.find(
      (def) => def.toolName === "ppal-create-clip",
    );

    expect(Object.keys(createClip?.toolOptions.inputSchema ?? {})).toContain(
      "code",
    );
  });

  for (const def of ALL_TOOL_DEFS) {
    it(`${def.toolName}: all param references exist in inputSchema`, () => {
      const { inputSchema, smallModelModeConfig, notationConfig } =
        def.toolOptions;
      const params = new Set(Object.keys(inputSchema));

      const notationRefs = Object.values(notationConfig ?? {}).flatMap(
        (override) => Object.keys(override.descriptionOverrides ?? {}),
      );

      const referencedParams = [
        ...(smallModelModeConfig?.excludeParams ?? []),
        ...Object.keys(smallModelModeConfig?.descriptionOverrides ?? {}),
        ...Object.keys(smallModelModeConfig?.excludeEnumValues ?? {}),
        ...notationRefs,
      ];

      const dangling = referencedParams.filter((ref) => !params.has(ref));

      expect(dangling).toStrictEqual([]);
    });
  }
});
