// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type ChatClientConfig } from "#webui/chat/sdk/types";

/**
 * Keep the latest context length a lookup reported, without waiting on it.
 * Starts one lookup now; an older lookup that answers late never overwrites a
 * newer one.
 * @param lookup - The config's lookup, if any
 * @returns The latest known length and a way to read it again
 */
export function trackContextLength(
  lookup: (() => Promise<number | undefined>) | undefined,
): { readonly latest: number | undefined; refresh: () => void } {
  let latest: number | undefined;
  let started = 0;
  let answered = 0;

  const refresh = (): void => {
    const id = ++started;

    void lookup?.().then((length) => {
      if (id > answered) {
        answered = id;
        latest = length;
      }
    });
  };

  refresh();

  return {
    get latest() {
      return latest;
    },
    refresh,
  };
}

/**
 * Name a model, to tell one model's steps from another's.
 * @param model - The config's model
 * @returns Its provider and id
 */
export function modelName(model: ChatClientConfig["model"]): string {
  return typeof model === "string"
    ? model
    : `${model.provider}/${model.modelId}`;
}
