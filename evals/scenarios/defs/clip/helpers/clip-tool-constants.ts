// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tool names and standard user messages the clip scenarios share.
 */

import { CONNECT_MESSAGE } from "../../../helpers/seed-connect/seed-connect.ts";

/** Connect tool name (turn-0 connect assertion). */
export const TOOL_CONNECT = "ppal-connect";

/** update-clip tool name. */
export const TOOL_UPDATE_CLIP = "ppal-update-clip";

/** read-clip tool name. */
export const TOOL_READ_CLIP = "ppal-read-clip";

/** create-clip tool name (turn-1 create assertion in single-clip scenarios). */
export const TOOL_CREATE_CLIP = "ppal-create-clip";

/** Standard turn-0 message that opens a connection to Live. */
export const MSG_CONNECT = CONNECT_MESSAGE;

/** Standard message to read the drum clip in scene 1 (drum scenarios). */
export const READ_DRUM_NOTES =
  "Find the drum clip in the first scene and read its notes";
