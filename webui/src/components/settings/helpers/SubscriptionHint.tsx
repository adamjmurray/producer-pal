// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { SUBSCRIPTION_INSTALL_DOCS_URL } from "#webui/lib/config";

interface SubscriptionHintProps {
  chatSetUp: boolean;
}

/**
 * A note at the top of the Connection tab pointing AI subscribers at the
 * cheaper install paths. Gone for good once chat is set up.
 * @param props - Component props
 * @param props.chatSetUp - Whether chat has been set up
 * @returns Note element, or null once chat is set up
 */
export function SubscriptionHint({ chatSetUp }: SubscriptionHintProps) {
  if (chatSetUp) {
    return null;
  }

  return (
    <p
      className="text-xs text-zinc-500 dark:text-zinc-300"
      data-testid="subscription-hint"
    >
      This chat uses pay-as-you-go API keys or local models.{" "}
      <a
        href={SUBSCRIPTION_INSTALL_DOCS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 hover:underline dark:text-blue-400"
      >
        Have an AI subscription? Use it instead.
      </a>
    </p>
  );
}
