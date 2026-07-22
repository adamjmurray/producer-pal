# ADR-0013: Config-override env vars are opt-in (gated), not opt-out

- **Status:** Accepted
- **Date logged:** 2026-07-11

## Context

The portal (`npx producer-pal` and the Claude Desktop `.mcpb` bundle) can
override the device's global settings — small-model mode, notation, response
format, Direct Live API — by POSTing them to `/config`. Each has a CLI flag and
an env var. These same settings are also configurable directly on the device
(Setup tab) and in the chat UI, which are the normal source of truth.

Two forces make the default here non-obvious:

1. **The Claude Desktop extension emits _every_ setting env var
   unconditionally.** The manifest fills `SMALL_MODEL_MODE`, `LIVE_API`,
   `JSON_OUTPUT`, `NOTATION` from `user_config` on every launch, and mcpb
   materializes an untoggled boolean as the string `"false"` and an empty text
   field as `""`. So a _stock_ extension — user changed nothing — still sends
   `SMALL_MODEL_MODE="false"`, `LIVE_API="false"`, `JSON_OUTPUT="false"`,
   `NOTATION=""`. mcpb has no conditional templating; a declared env var is
   always substituted.
2. **Env vars are ambient.** A shell or parent process can export them, and the
   portal would inherit them unintentionally.

## Decision

Gate all **env-var** overrides behind `ALLOW_CONFIGURATION_OVERRIDES=true`
(default **off** → env overrides ignored, device/chat-UI authoritative).
Explicit **CLI flags** (`-s`, `-n`, `-f`, `-l`) are **not** gated — passing a
flag is already an intentional per-invocation opt-in. The extension surfaces the
gate as an "Allow configuration overrides" master toggle, off by default.

Implemented at `src/portal/producer-pal-portal.ts` (`allowEnvOverrides`), which
reads `=== "true"` (opt-in), not `!== "false"` (opt-out).

## Alternatives rejected

- **Default-allow / opt-out** (honor env overrides unless
  `ALLOW_CONFIGURATION_OVERRIDES=false`). Tempting: it's the intuitive polarity
  and makes the raw-CLI env path work with no extra var. **Rejected** — because
  the extension emits all setting env vars unconditionally, default-allow makes
  a stock extension push `smallModelMode:false` / `liveApiEnabled:false` /
  `jsonOutput:false` to the device on **every request** (overrides re-push per
  request — see `stdio-http-bridge.ts`), silently clobbering settings the user
  chose on the device or in the chat UI, and re-clobbering them each request.
  The three booleans **can't express "unset"** in mcpb's boolean type, so
  there's no way to tell "user wants it off" from "user didn't touch it." The
  gate is the only clean way to mean "the extension isn't overriding these."
  (Notation dodges the trap only because empty-string already means "no
  override" — precisely the expressiveness the booleans lack.)
- **Split the code paths** — default-allow for raw env, gated for the extension.
  Rejected as needless complexity: one env var and one portal code path serve
  both surfaces. Every docs example steers CLI users to the ungated **flags**,
  so the gated env path is a secondary route with acceptable extra friction.

## Consequences

- Device/chat-UI settings stay authoritative by default; the extension overrides
  only when the user flips the master toggle. Matches the "Device stays
  authoritative by default" promise in `docs/installation/claude-desktop.md`.
- Raw `npx`/env users who prefer env vars over flags must **also** set
  `ALLOW_CONFIGURATION_OVERRIDES=true`. Documented in `npm/README.md` and
  `dev/Development-Tools.md`. This is a behavior change vs ≤1.4.14, where
  `SMALL_MODEL_MODE` (the only config env var that existed then) was honored
  ungated.
- Correctness leans on mcpb templating an untoggled boolean as the literal
  `"false"` — already load-bearing for the tri-state "force off" feature. If
  that ever changes, revisit.
- Revisit trigger: mcpb gains conditional env emission, or the ambient-env risk
  proves irrelevant in practice and the extra CLI friction outweighs it.
