# ADR-0013: Config-override env vars are opt-in, not opt-out

- **Status:** Accepted
- **Date logged:** 2026-07-11

## Context

The portal (`npx producer-pal` and the Claude Desktop bundle) can override the
device's global settings — small-model mode, notation, response format, Direct
Live API — by POSTing them to `/config`. Each has both a CLI flag and an env
var. The device's Setup tab and the chat UI are the normal source of truth for
these.

Two things make the default polarity non-obvious:

1. **The Claude Desktop extension emits every setting env var unconditionally.**
   mcpb has no conditional templating, so a stock extension — user changed
   nothing — still sends `SMALL_MODEL_MODE="false"`, `LIVE_API="false"`,
   `JSON_OUTPUT="false"`, `NOTATION=""`.
2. **Env vars are ambient.** A shell or parent process can export them and the
   portal would inherit them by accident.

## Decision

Gate all **env-var** overrides behind `ALLOW_CONFIGURATION_OVERRIDES=true`,
default off. Explicit **CLI flags** (`-s`, `-n`, `-f`, `-l`) are not gated —
passing a flag is already an intentional opt-in. The extension surfaces the gate
as an "Allow configuration overrides" toggle, off by default.

`src/portal/producer-pal-portal.ts` reads it as `=== "true"` (opt-in), not
`!== "false"` (opt-out).

## Alternatives rejected

- **Default-allow / opt-out.** Tempting — it's the intuitive polarity and needs
  no extra var. But because the extension emits every setting env var, a stock
  extension would push `smallModelMode:false`, `liveApiEnabled:false`, and
  `jsonOutput:false` to the device on _every request_, silently clobbering
  whatever the user chose on the device or in the chat UI, and re-clobbering it
  each request. mcpb's boolean type can't express "unset", so there's no way to
  distinguish "user wants it off" from "user didn't touch it". (Notation dodges
  the trap only because empty string already means "no override" — exactly the
  expressiveness the booleans lack.)
- **Split the code paths** — default-allow for raw env, gated for the extension.
  Needless complexity: one env var and one code path serve both. The docs steer
  CLI users to the ungated flags anyway.

## Consequences

- Device and chat-UI settings stay authoritative by default, matching the
  promise in `docs/installation/claude-desktop.md`.
- Raw `npx` users who prefer env vars must also set
  `ALLOW_CONFIGURATION_OVERRIDES=true`. This is a behavior change from ≤1.4.14,
  where `SMALL_MODEL_MODE` was honored ungated.
- **Load-bearing assumption:** mcpb templates an untoggled boolean as the
  literal `"false"`. If that ever changes, revisit — the tri-state "force off"
  feature depends on it too.
