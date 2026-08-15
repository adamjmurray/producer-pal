// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Operation types the ppal-live-api tool accepts, grouped the way the tool
 * description groups them. Shared so the schema enum and the dispatch table
 * can't drift apart.
 */
export const LIVE_API_OPERATION_TYPES = [
  // Live Object Model
  "get",
  "set",
  "set_property",
  "call",
  "goto",
  "info",

  // Producer Pal helpers, returning normalized values
  "getProperty",
  "getChildIds",
  "exists",
  "getColor",
  "setColor",

  // The LiveAPI object itself, not the Live object it points at
  "get_property",
  "set_path",
  "set_mode",
  "set_id",
  "call_method",
  "getcount",
  "getstring",
] as const;

// call/call_method and get/get_property are not aliases: `call` and `get` reach
// the Live object, their counterparts reach the JavaScript wrapper. Only
// set/set_property really do the same write.

export type OperationType = (typeof LIVE_API_OPERATION_TYPES)[number];

/** Cap on operations per call, so one request can't tie up Live indefinitely. */
export const MAX_OPERATIONS = 50;
