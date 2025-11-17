# Producer Pal Security Policy

## Security Model

The Producer Pal tools can only do things inside Ableton Live, so damage
potential is limited to modifications within your Ableton Live project (clips,
tracks, scenes, etc.)

Producer Pal itself (not the LLM) runs entirely on your local machine:

- MCP server runs in Node.js on localhost
- Max for Live device runs in Ableton Live
- No data leaves your computer except API calls to your chosen AI provider (if
  using online models)

You control:

- Which AI provider to use
- Your API keys, if applicable (only stored locally)
- All network communication (e.g. disable Wi-Fi to confirm fully offline use
  when using local models)

## Reporting Security Issues

**Do not report security vulnerabilities through public GitHub issues.**

Use GitHub's private vulnerability reporting feature
([Security tab](https://github.com/adamjmurray/producer-pal/security) → Report a
vulnerability).

I'll respond as soon as I can.

## Supported Versions

Only the latest release receives security updates. This is a personal project
with no support guarantees.

## Security Best Practices

- Keep any API keys and web tunnel URLs (only used for webapps like ChatGPT)
  private
- Use the latest version of Producer Pal
- Be cautious when using unfamiliar forks of this repository

## Known Limitations

- No input sanitization for malicious AI responses (trusts AI providers)
- Local HTTP server has no authentication (localhost only)

This project prioritizes functionality and ease of use over hardened security.
It's designed for trusted local use, not deployment in adversarial environments.
