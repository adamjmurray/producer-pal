// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { useEffect, useState } from "preact/hooks";
import {
  PREVIEW_APP_SOURCE_EVENT,
  readPreviewAppSource,
} from "#webui/lib/utils/gen-ui/preview-app-source";

/**
 * Follow the previewed app's source, re-reading it on the change event.
 *
 * @returns The app source, or null when none is set
 */
export function usePreviewAppSource(): string | null {
  const [source, setSource] = useState(readPreviewAppSource);

  useEffect(() => {
    const reread = (): void => setSource(readPreviewAppSource());

    window.addEventListener(PREVIEW_APP_SOURCE_EVENT, reread);

    return () => window.removeEventListener(PREVIEW_APP_SOURCE_EVENT, reread);
  }, []);

  return source;
}
