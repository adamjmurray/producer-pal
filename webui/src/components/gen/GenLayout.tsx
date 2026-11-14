// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { App } from "#webui/components/App";
import { GenPanel } from "./GenPanel";

/**
 * The chat with the generative-UI widget panel beside it. Only reached by URL
 * (`/chat?view=gen`).
 *
 * @returns Layout element
 */
export function GenLayout(): preact.JSX.Element {
  return (
    <div className="flex h-screen">
      <div className="min-w-0 flex-1">
        <App />
      </div>
      <GenPanel />
    </div>
  );
}
