// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { useGlobalContext } from "#webui/hooks/context/use-global-context";
import { describeDocTransport } from "./doc-transport-test-helpers";

// happy-dom defaults to http://localhost:3000/, so the same-origin endpoint
// resolves to localhost:3000/global-context.
describeDocTransport({
  hookName: "useGlobalContext",
  useHook: useGlobalContext,
  url: "http://localhost:3000/global-context",
  readError: "Global context request failed",
  writeError: "Global context update failed",
});
