// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// What V8 and Node share about every call to a remote-script route that isn't
// the browser: the reply's shape and the wording for silence.

/** What a caller is told when the remote script gave no answer at all. */
export const REMOTE_SCRIPT_UNANSWERED =
  "the Producer Pal remote script did not answer in time";

/** What such a route answers. `error` is worded for the model. */
export type RouteReply<Result> =
  | { available: false }
  | { available: true; error: string }
  | { available: true; result: Result };
