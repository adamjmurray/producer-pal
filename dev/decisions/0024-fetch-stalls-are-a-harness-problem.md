# ADR-0024: The ~2s `fetch` stall is fixed in the harness, not the portal

- **Status:** Accepted
- **Date logged:** 2026-08-15

## Context

Tool calls measured over the REST API with a sleep between them took ~2.1s each
at 1s spacing, against ~110ms back to back. It looked like the dominant source
of Producer Pal latency, since a model calls a tool every few seconds.

It is a bug in Node's built-in `fetch`. Node vendors undici, and 8.9.0 (Node
26.5.1) validates an idle keep-alive socket inside an unref'd `setImmediate`
whose callback releases the pending write. An unref'd Immediate does not force
the poll phase to wake, so the request sits unsent until the event loop wakes
for some other reason. In a script that sleeps between calls, that is the next
sleep — so **gap + stall snaps to a constant**: 500ms for short gaps, 3000ms for
gaps under 3s, and gaps of 3s+ escape entirely.

The trigger is therefore narrow: the calling process's loop must have been
asleep **in a timer**. A loop woken by I/O iterates, runs the Immediate, and
never stalls.

| Client shape                                     | Per call |
| ------------------------------------------------ | -------- |
| Sleeps on its own `setTimeout`, then fetches     | ~2000 ms |
| Parked on stdin, woken by pipe I/O, then fetches | 2–4 ms   |

That distinction is what settles it: **the portal is not affected.** It is woken
by stdio traffic from its MCP client, never by a timer. Measured against the
real built artifact at seven spacings from 200ms to 2500ms: zero stalls, median
19–25ms throughout. The chat UI uses browser networking and is also unaffected.
No shipped path has ever had this.

What is affected is our own tooling — the e2e suite (`await sleep(50)` between
calls everywhere) and evals (the MCP poll loop, and any provider backoff before
a tool call). Evals also record latency into their results, so the numbers were
inflated too.

## Decision

Install an explicit undici dispatcher in the harness only, via
`evals/shared/install-fetch-dispatcher.ts` — imported by the eval entry points
and wired as `setupFiles` in `config/vitest.e2e.config.ts`. `undici` is a
**devDependency**; nothing ships it. This cut one e2e file from ~16s to ~13s.

The version is the whole fix, not the fact that the Agent is constructed
explicitly. undici fixed this in 8.10.0 (`setTimeout(…, 0)`); 7.29.0 predates
the regression. **A standalone 8.9.0 stalls exactly like Node's built-in**, so
moving the pin to 8.9.0 would silently undo this.

Docs carry a user-facing warning under the REST API sample scripts, because
someone scripting the API with sleeps hits this in their own process and we
cannot fix it from the device.

## Alternatives rejected

**Bundling undici into the portal.** Built and measured it: 823 KB added to
every shipped artifact (785 KB → 1608 KB, 2.05×) to fix a path that provably
does not stall. The claim that it did came from an in-process harness rather
than the shipped portal; testing the real artifact is what caught it.

**Reconfiguring Node's own fetch without a dependency.** There is no supported
way. Node does not expose its vendored undici, and the global dispatcher symbol
holds an internal wrapper with the options already baked in — re-setting it
changes nothing (verified). The only dependency-free alternative is `node:http`,
which never stalls but does not cover code that calls `fetch` directly.

**Chasing it inside Producer Pal.** The description's two leads — a
`syncProjectContextBackup` memo TTL and Max's low-priority queue starving — were
both ruled out. It reproduces against a 30-line `node:http` echo server with no
Producer Pal in the picture, and server-side timestamps put 100% of the delay
before the request arrives.

## Consequences

This module can be deleted once Node vendors undici >= 8.10.0.

Until then, **never benchmark with a `fetch` + `sleep` loop.** Any latency taken
that way is inflated and quantized to the buckets above. Use `node:http`, an
explicit dispatcher, or drive the target process over a pipe.
