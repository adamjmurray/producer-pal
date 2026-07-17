# Producer Pal Security Policy

Running Producer Pal means running someone else's software on your computer, and
trusting it near your creative work. That's a real ask, and I take it seriously.
This page describes what Producer Pal can do, what it deliberately can't, and
where the sharp edges are — including the ones that aren't fixed yet.

## What Producer Pal Can and Can't Do

The Producer Pal tools act only inside Ableton Live, so the blast radius is your
Live Set: clips, tracks, scenes, devices, and the like. There is no tool that
reads your documents, writes arbitrary files, or runs programs.

Producer Pal itself (not the LLM) runs entirely on your machine:

- The MCP server runs in Node.js, inside the Max for Live device
- The Max for Live device runs in Ableton Live
- Nothing leaves your computer except the API calls to the AI provider you chose

Two deliberate exceptions to "acts only inside Live":

- **Ableton's library database.** The `ppal-library` tool reads Live's own
  SQLite catalog to find sounds and presets. It is read-only by construction —
  the database is opened in read-only mode and only ever queried, never written.
  It ships enabled; you can turn it off per-tool in the chat UI settings.
- **Producer Pal's own config.** Global context, custom instructions, and
  similar user content live under `~/.producer-pal`. Nothing else on your
  filesystem is read or written, and API keys are never stored there.

## What's Not in Shipped Builds

Some capabilities exist in the source for development, and are removed from
released builds rather than merely switched off:

- **Code execution.** An experimental feature that runs generated JavaScript is
  present in the codebase behind a build flag. It is stripped out of shipped
  builds — the code and the tool parameters that expose it are not in the
  released bundle at all.
- **Permissive CORS.** Development builds relax cross-origin rules so the chat
  UI can be served from a dev server. Shipped builds send no such headers.

Continuous integration fails the build if any of these development flags are set
when producing a release, so they can't be enabled by accident.

Shipped code also cannot shell out or evaluate strings: importing
`child_process` is blocked by lint rules across all shipped source, as are
`eval` and `new Function`.

## Your API Keys

You choose the provider, you bring the key, and the key stays on your machine.

- Keys are **encrypted at rest** in your browser (AES-GCM, under a
  non-extractable key held in IndexedDB). Plaintext keys are not written to
  local storage.
- **Text chat** calls your provider directly from the browser. The key does not
  pass through the local server.
- **Voice mode** is the exception: the key is sent to the local server, which
  exchanges it with the provider for a short-lived token. It is not logged and
  not stored, but it does transit the local process.

This protects against casual disclosure — someone reading your local storage —
not against an attacker who already has code execution in your browser. It's a
deliberate trade for a local, bring-your-own-key tool, not bank-grade key
custody. See `dev/decisions/0006-encrypted-keys-no-backend-proxy.md` for the
reasoning and the rejected alternatives.

## Supply Chain and Provenance

- **Exact versions only.** Every dependency is pinned to an exact version — no
  ranges — and a test enforces it. A new version can't slip in from a range
  match.
- **Release cooldown.** New dependency releases must be at least 7 days old
  before they can be installed, so a compromised package has a window to be
  caught before it reaches this project.
- **Bundled at build time.** Dependencies are compiled into the released
  artifact. Nothing is installed on your machine when you use Producer Pal, and
  no dependency install scripts run on your side.
- **Dependabot** proposes dependency and GitHub Actions updates weekly, with a
  cooldown before a bump is offered.
- **Pinned CI actions.** Every GitHub Action is pinned to a commit hash, not a
  moving tag.
- **Static analysis.** GitHub's CodeQL scans Producer Pal's own JavaScript,
  TypeScript, and GitHub Actions workflows on every pull request and weekly on
  the default branch.
- **Signed commits and tags.** Signing commits and release tags is the standard
  for this project going forward. The practice was adopted during v2.0.0
  development, so v2.0.0 is the first signed release tag; earlier history
  predates it and is unsigned.

## Known Limitations

Stated plainly, because you should be able to make your own call:

- **The local server has no authentication, and it is reachable from your local
  network** — not just from localhost. It listens on port 3350 on all network
  interfaces, which is what makes remote and tunneled setups work. On a network
  you trust (your own home Wi-Fi), this is generally fine. On shared or public
  Wi-Fi, anyone on that network who finds the port can drive Ableton Live
  through it. If that matters to you, don't run Producer Pal on an untrusted
  network.
- **Web tunnel URLs are effectively secrets.** If you expose Producer Pal
  through a tunnel, anyone with the URL can reach it. Treat it like a password.
- **Tool inputs trust the AI provider.** Producer Pal assumes the model's tool
  calls are well-intentioned. Rendered chat output is sanitized against XSS, but
  the tools themselves do not defend against a hostile model.

This project prioritizes functionality and ease of use over hardened security.
It's designed for trusted local use, not deployment in adversarial environments.

## Security Best Practices

- Keep your API keys and any web tunnel URLs private
- Prefer a network you trust, or don't leave Producer Pal running on one you
  don't
- Use the latest version of Producer Pal
- Be cautious when using unfamiliar forks of this repository

## Reporting Security Issues

**Do not report security vulnerabilities through public GitHub issues.**

Use GitHub's private vulnerability reporting feature
([Security tab](https://github.com/adamjmurray/producer-pal/security) → Report a
vulnerability).

I'll respond as soon as I can.

## Supported Versions

Only the latest release receives security updates. This is a personal project
with no support guarantees.
