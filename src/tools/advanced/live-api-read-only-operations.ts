// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/** Operations that never write to Live; every other type may. */
export const READ_ONLY_OPERATION_TYPES: ReadonlySet<string> = new Set([
  "get",
  "info",
  "getcount",
  "getstring",
  "get-property",
  "get-child-ids",
  "exists",
  "get-color",
  "get-field",
]);
