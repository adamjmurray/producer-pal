// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { z } from "zod";
import { GEN_UI_TOOL_ID, WIDGET_KINDS } from "#src/shared/gen-ui-types.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

// Experimental, behind ENABLE_GEN_UI. Not a Live write tool: it only changes the
// widgets on the generative-UI view, which Node keeps. It never reaches V8, so
// it skips the write pipeline and the write queue (see with-gen-ui.ts).
export const toolDefUi = defineTool(GEN_UI_TOOL_ID, {
  title: "UI",
  description:
    "Put widgets on the user's side panel (open at /chat?view=gen). " +
    "kind=clip shows a Session clip (ref = clip id or path like t0/s3) and follows it as it changes; " +
    "kind=text shows a note. " +
    "Actions: create (kind + ref or text), update (id + fields to change), remove (id), list. " +
    "Create a clip widget after you create or change a clip so the user sees it.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
  },
  inputSchema: {
    action: z.enum(["create", "update", "remove", "list"]),
    id: z.coerce.string().optional().describe("widget id (update, remove)"),
    kind: z.enum(WIDGET_KINDS).optional().describe("widget kind (create)"),
    ref: z.coerce
      .string()
      .optional()
      .describe("clip widget: Session clip id or path, e.g. t0/s3"),
    text: z.string().optional().describe("text widget: the note to show"),
    title: z.string().optional().describe("heading; blank clears it"),
  },
});
