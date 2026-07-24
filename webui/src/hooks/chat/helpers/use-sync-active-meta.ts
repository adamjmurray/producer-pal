// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type MutableRef, useEffect } from "preact/hooks";
import {
  type ActiveMeta,
  DEFAULT_META,
} from "#webui/hooks/chat/helpers/use-conversations-helpers";
import { type Provider } from "#webui/types/settings";

export interface SyncActiveMetaParams {
  activeModel: string | null;
  activeProvider: Provider | null;
  activeThinking: string | null;
  activeSmallModelMode: boolean | null;
  activeSystemInstruction: string | null;
}

/**
 * Mirrors active chat metadata (model/provider/thinking/etc.) from useChat
 * into a ref so saves/lookups can read it synchronously without depending on
 * a re-render. Extracted from useConversations to keep its main function
 * under the size limit.
 *
 * @param activeMetaRef - Ref holding the current conversation's meta snapshot
 * @param props - Latest meta values from useChat
 */
export function useSyncActiveMeta(
  activeMetaRef: MutableRef<ActiveMeta | null>,
  props: SyncActiveMetaParams,
): void {
  const {
    activeModel,
    activeProvider,
    activeThinking,
    activeSmallModelMode,
    activeSystemInstruction,
  } = props;

  useEffect(() => {
    activeMetaRef.current ??= { ...DEFAULT_META };
    const meta = activeMetaRef.current;

    if (activeModel != null) meta.model = activeModel;
    if (activeProvider != null) meta.provider = activeProvider;
    if (activeThinking != null) meta.thinking = activeThinking;
    if (activeSmallModelMode != null)
      meta.smallModelMode = activeSmallModelMode;
    if (activeSystemInstruction != null)
      meta.systemInstruction = activeSystemInstruction;
  }, [
    activeMetaRef,
    activeModel,
    activeProvider,
    activeThinking,
    activeSmallModelMode,
    activeSystemInstruction,
  ]);
}
