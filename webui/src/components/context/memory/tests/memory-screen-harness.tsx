// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { MemoryScreen } from "#webui/components/context/memory/MemoryScreen";
import { useMemoryCollection } from "#webui/hooks/context/use-memory-collection";

const TAB_SLOT = <div data-testid="tabs">tabs</div>;

/**
 * The Memory tab wired to the real collection hook over the stubbed fetch.
 * Lives alone in this file so the shared helpers beside it aren't a mixed
 * component/utility module.
 * @returns The screen element
 */
export function MemoryScreenHarness(): preact.JSX.Element {
  const collection = useMemoryCollection();

  return <MemoryScreen collection={collection} tabSlot={TAB_SLOT} />;
}
