// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  APP_SANDBOX,
  buildAppDocument,
} from "#webui/lib/utils/gen-ui/app-document";

/**
 * Runs an AI-written app in a sandboxed iframe (opaque origin, no network).
 * Nothing about the host is passed in. A new `source` replaces the app in the
 * same iframe; a new `reloadToken` restarts it. The rest of the page is
 * untouched.
 *
 * The bridge will attach here: listen on the host window for `message` events
 * whose `source` is this iframe's `contentWindow` (check `source`, not
 * `origin`, which reads "null").
 *
 * @param props - Component props
 * @param props.source - The app's HTML, CSS and JS as one document
 * @param props.reloadToken - Change it to restart the app with the same source
 * @param props.title - Accessible name for the frame
 * @returns The iframe element
 */
export function AppHost({
  source,
  reloadToken = 0,
  title = "App",
}: {
  source: string;
  reloadToken?: number;
  title?: string;
}): preact.JSX.Element {
  return (
    <iframe
      key={reloadToken}
      title={title}
      sandbox={APP_SANDBOX}
      srcdoc={buildAppDocument(source)}
      referrerPolicy="no-referrer"
      className="block h-full w-full border-0 bg-white"
      data-testid="gen-app-frame"
    />
  );
}
