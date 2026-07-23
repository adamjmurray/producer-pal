// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { getGlobalContextUrl } from "#webui/utils/mcp-url";
import { makeContentTransport, type UseDocReturn, useDoc } from "./use-doc";

// Module-scope so the transport is a stable reference across renders (the
// origin is fixed for the page's lifetime — see useDoc's read/write note).
const { read, write } = makeContentTransport(
  getGlobalContextUrl(),
  "Global context",
);

/**
 * Read and write the machine-global user context (~/.producer-pal/context.md)
 * via the backend `/global-context` endpoint — persistent facts that apply
 * across every project, distinct from the per-project `/config` project
 * context. A thin
 * transport over the shared {@link useDoc} core.
 * @returns Global context state plus save/refresh actions
 */
export function useGlobalContext(): UseDocReturn {
  return useDoc(read, write);
}
