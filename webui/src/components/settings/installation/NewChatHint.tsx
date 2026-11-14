// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { noteClass } from "./helpers/installation-classes";

/**
 * Shown once the new version is, or will be, running: a chat that started
 * before it still has the old version's skills and tools.
 * @param {object} props - Component props
 * @param {string} props.testId - The element's test id
 * @param {boolean} [props.afterRestart] - The new version only loads once Live restarts
 * @returns {JSX.Element} The hint
 */
export function NewChatHint({
  testId,
  afterRestart = false,
}: {
  testId: string;
  afterRestart?: boolean;
}) {
  return (
    <p className={noteClass} data-testid={testId}>
      {afterRestart
        ? "After restarting Live, start a new chat so it picks up the new version."
        : "Start a new chat so it picks up the new version."}
    </p>
  );
}
