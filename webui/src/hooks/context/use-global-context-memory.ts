// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { getGlobalContextUrl } from "#webui/utils/mcp-url";
import {
  makeContentTransport,
  type UseDocMemoryReturn,
  useDocMemory,
} from "./use-doc-memory";

// Module-scope so the transport is a stable reference across renders (the
// origin is fixed for the page's lifetime — see useDocMemory's read/write note).
const { read, write } = makeContentTransport(
  getGlobalContextUrl(),
  "Global context",
);

/**
 * Read and write the machine-global user context (~/.producer-pal/context.md)
 * via the backend `/global-context` endpoint — persistent facts that apply
 * across every project, distinct from the per-project `/config` memory. A thin
 * transport over the shared {@link useDocMemory} core.
 * @returns Global context state plus save/refresh actions
 */
export function useGlobalContextMemory(): UseDocMemoryReturn {
  return useDocMemory(read, write);
}
