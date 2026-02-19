// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefConnect = defineTool("ppal-connect", {
  title: "Connect",
  description: `Connect to Ableton Live and initialize Producer Pal.
Call before other ppal-* tools when the user says use/connect to ableton.`,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    // No parameters - everything is hardcoded for safety
  },
});
