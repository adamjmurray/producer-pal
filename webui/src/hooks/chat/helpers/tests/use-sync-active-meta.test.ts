// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { renderHook } from "@testing-library/preact";
import { describe, expect, it } from "vitest";
import {
  type SyncActiveMetaParams,
  useSyncActiveMeta,
} from "#webui/hooks/chat/helpers/use-sync-active-meta";
import {
  type ActiveMeta,
  DEFAULT_META,
} from "#webui/hooks/chat/helpers/use-conversations-helpers";

const ALL_NULL: SyncActiveMetaParams = {
  activeModel: null,
  activeProvider: null,
  activeThinking: null,
  activeTemperature: null,
  activeShowThoughts: null,
  activeSmallModelMode: null,
  activeSystemInstruction: null,
};

describe("useSyncActiveMeta", () => {
  it("seeds the ref with defaults and skips null values", () => {
    const ref: { current: ActiveMeta | null } = { current: null };

    renderHook(() => useSyncActiveMeta(ref, ALL_NULL));

    expect(ref.current).toStrictEqual(DEFAULT_META);
  });

  it("mirrors every non-null value into the ref", () => {
    const ref: { current: ActiveMeta | null } = { current: null };

    renderHook(() =>
      useSyncActiveMeta(ref, {
        activeModel: "claude-sonnet-5",
        activeProvider: "anthropic",
        activeThinking: "high",
        activeTemperature: 0.7,
        activeShowThoughts: true,
        activeSmallModelMode: false,
        activeSystemInstruction: "Be brief.",
      }),
    );

    expect(ref.current).toStrictEqual({
      ...DEFAULT_META,
      model: "claude-sonnet-5",
      provider: "anthropic",
      thinking: "high",
      temperature: 0.7,
      showThoughts: true,
      smallModelMode: false,
      systemInstruction: "Be brief.",
    });
  });
});
