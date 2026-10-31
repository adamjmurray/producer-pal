// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { aliasedEnum } from "#src/tools/shared/tool-framework/enum-aliases.ts";
import {
  MANAGE_ACTION_ALIASES,
  MANAGE_ACTIONS,
  MAX_STEPS,
} from "./helpers/manage-contract.ts";

export const toolDefManage = defineTool("ppal-manage", {
  title: "Manage",
  description:
    "Act on Live itself: install Producer Pal (remote script and device), " +
    "add or update Producer Pal in the open Live Set, or undo and redo in " +
    "Live's history. " +
    "That history includes the user's own edits in Live, so an undo may " +
    "revert something they did.",

  // Small models don't get it: they have no use for it, and the schema would
  // cost context.
  omitInSmallModel: true,

  annotations: {
    readOnlyHint: false,
    destructiveHint: true, // undo and redo revert changes
  },

  inputSchema: {
    action: aliasedEnum(MANAGE_ACTIONS, MANAGE_ACTION_ALIASES).describe(
      "install-producer-pal: put the remote script (adds clip automation, " +
        "plug-in/preset loading, audio-to-MIDI and undo/redo) and the " +
        "device in the User Library; the user must then restart Live. " +
        "add-producer-pal: put the Producer Pal device on a new MIDI track " +
        "in the open Live Set, while Producer Pal isn't running yet; needs " +
        "the remote script; without it, the call errors after installing the " +
        "device file, adding nothing. Unless the user asked for it, ask first: " +
        "it changes their Set. " +
        "update-producer-pal: replace the running Producer Pal device with " +
        "the newer one this connector ships, in place; only works through that " +
        "connector (npx or Claude Desktop); needs the remote script. Unless the " +
        "user asked for it, ask first. " +
        "undo, redo: step back or forward; needs the remote script",
    ),

    steps: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_STEPS)
      .optional()
      .describe(
        `undo, redo only: how many steps, default 1, max ${String(MAX_STEPS)}. ` +
          "Stops where history ends.",
      ),

    userLibrary: z
      .string()
      .optional()
      .describe(
        "install-producer-pal, add-producer-pal, update-producer-pal only: absolute path to Live's User Library, " +
          "for when it can't be found automatically. Ask the user " +
          "(Live: Settings → Library → Location of User Library).",
      ),
  },
});
