// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// How a request to the remote script fails: what Live may have done about it.

/** What a caller is told when the connection broke after the request went out. */
export const CONNECTION_LOST =
  "the connection to the Producer Pal remote script was lost before it answered";

/**
 * The connection to the remote script broke after it was made: the request
 * went out, so Live may have acted on it. Node's own error is the `cause`.
 */
export class RemoteScriptConnectionLost extends Error {
  constructor(cause: unknown) {
    super(CONNECTION_LOST, { cause });
    this.name = "RemoteScriptConnectionLost";
  }
}

/** The remote script took the connection but didn't answer in time. */
export class RemoteScriptTimeout extends Error {
  /**
   * Whether the request went out. If so, Live may have acted on it; if not,
   * nothing was asked of it.
   */
  readonly sent: boolean;

  constructor(message: string, sent: boolean) {
    super(message);
    this.name = "RemoteScriptTimeout";
    this.sent = sent;
  }
}
