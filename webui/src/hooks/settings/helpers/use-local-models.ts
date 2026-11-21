// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useEffect, useState } from "preact/hooks";
import {
  fetchLocalModels,
  type LocalModel,
} from "#webui/chat/sdk/provider/local-model/local-model-catalog";
import { type Provider } from "#webui/types/settings";

/** Wait this long after the URL stops changing before asking the server. */
export const LOCAL_MODELS_DEBOUNCE_MS = 400;

/**
 * The models a local provider's server has downloaded, fetched when the
 * provider or its URL changes.
 * @param provider - Current provider
 * @param baseUrl - The provider's URL setting
 * @returns The models, or undefined for a non-local provider, while loading,
 *   or when the server can't be read
 */
export function useLocalModels(
  provider: Provider,
  baseUrl: string | null | undefined,
): LocalModel[] | undefined {
  const url = baseUrl ?? undefined;
  // Tagged with what it was fetched for, so the render right after a provider
  // or URL change never shows the previous server's list.
  const [fetched, setFetched] = useState<FetchedModels | undefined>();

  useEffect(() => {
    if (provider !== "lmstudio" && provider !== "ollama") {
      return undefined;
    }

    let current = true;
    const timer = setTimeout(() => {
      void fetchLocalModels(provider, url).then((models) => {
        if (current) {
          setFetched({ provider, url, models });
        }
      });
    }, LOCAL_MODELS_DEBOUNCE_MS);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [provider, url]);

  return fetched?.provider === provider && fetched.url === url
    ? fetched.models
    : undefined;
}

interface FetchedModels {
  provider: Provider;
  url: string | undefined;
  models: LocalModel[] | undefined;
}
