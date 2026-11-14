// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefConnect = defineTool("ppal-connect", {
  title: "Connect",
  description:
    "Connect to Ableton Live and initialize Producer Pal. Call before other ppal-* tools when the user says use/connect to ableton.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    versionCheck: z
      .boolean()
      .optional()
      .describe(
        "only re-check versions after an install, update, or Live restart in a chat that already connected. Never for the first connect in a chat",
      ),
  },
});
