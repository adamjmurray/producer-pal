// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { Agent, setGlobalDispatcher } from "undici";

// Import for side effect from any entry point that drives the MCP server.
//
// Node's built-in fetch IS undici, and the copy Node 26 vendors (8.9.0) has a
// bug: it validates an idle keep-alive socket in an unref'd `setImmediate`, and
// the callback is what releases the pending write. An unref'd Immediate doesn't
// force the poll phase to wake, so the request sits unsent until the loop wakes
// for some other reason — which, in a script that sleeps between calls, is the
// next sleep. Gap + stall therefore snaps to 500ms, or 3s for gaps under 3s.
//
// Anything that sleeps before a request pays it: the MCP poll loop in
// open-live-set.ts (~250ms per poll instead of ~25ms) and any provider
// rate-limit backoff before a tool call (a full 3s). Latency recorded in eval
// results is inflated the same way.
//
// The version matters, not the "explicitness" of the Agent: undici fixed this in
// 8.10.0 (`setTimeout(…, 0)` instead), and 7.29.0 predates the regression. Do
// not move this dependency to 8.9.0. It stops mattering once Node vendors
// >= 8.10.0, and this module can go then.
//
// Harness only. The shipped portal is woken by stdio traffic from its MCP client
// rather than a timer, so it never hits this and doesn't bundle undici.
setGlobalDispatcher(new Agent());
