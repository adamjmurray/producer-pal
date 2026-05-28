// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Per-call overrides exposed to callers of `callLiveApi`. These are caller-
 * driven (e.g. REST query params) and override adapter-level defaults for a
 * single request. Adapter-internal data like `silenceWavPath` is NOT here —
 * it's automatically injected by the adapter and not the caller's concern.
 *
 * Lives in its own module (no `max-api` import) so consumers like
 * create-mcp-server.ts can pull in the type without dragging the Max runtime
 * into typecheck graphs that don't need it (e.g. e2e tests).
 */
export interface RequestOverrides {
  /** Override the global compactOutput config for this call. */
  compactOutput?: boolean;
  /** Override the configured timeout (1–60000 ms) for this call. */
  timeoutMs?: number;
}

/** Maximum value accepted for a `timeoutMs` override (mirrors the global cap). */
export const MAX_TIMEOUT_MS = 60_000;
