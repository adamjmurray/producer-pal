// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { useTheme } from "#webui/hooks/theme/use-theme";
import { ContextScreen } from "./ContextScreen";

/**
 * Top-level shell for the /context route. Mounts the theme so dark/light
 * picks up the same preference as the chat UI.
 * @returns App element
 */
export function ContextApp(): preact.JSX.Element {
  // Activates theme effect (reads localStorage, toggles `dark` class on <html>).
  useTheme();

  // Close on this standalone route means "leave the editor" — navigate to the
  // chat. Full navigation (vs. SPA) is fine: main.tsx only reads pathname at
  // startup, and a clean reload guarantees the chat mounts fresh.
  return <ContextScreen onClose={() => window.location.assign("/")} />;
}
