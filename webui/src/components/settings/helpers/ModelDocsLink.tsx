// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { MODEL_DOCS_URLS } from "#webui/lib/constants/provider-urls";
import { type Provider } from "#webui/types/settings";

interface ModelDocsLinkProps {
  provider: Provider;
  providerLabel: string;
}

/**
 * External link to the provider's model docs, or nothing when it has no URL.
 * @param props - Component props
 * @param props.provider - Current provider
 * @param props.providerLabel - Display name for the provider
 * @returns Docs link element, or null
 */
export function ModelDocsLink({ provider, providerLabel }: ModelDocsLinkProps) {
  const url = MODEL_DOCS_URLS[provider];

  if (!url) {
    return null;
  }

  return (
    <p className="-mt-2 text-xs text-zinc-500 dark:text-zinc-300">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline dark:text-blue-400"
      >
        {providerLabel} models
      </a>
    </p>
  );
}
