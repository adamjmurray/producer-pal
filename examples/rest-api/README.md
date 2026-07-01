# Producer Pal REST API examples

Zero-dependency client examples for Producer Pal's
[REST API](https://producer-pal.org/guide/rest-api).

## Node.js

The Node.js client doubles as the Producer Pal
[agent skill](https://producer-pal.org/guide/skills) script and lives in the
skill folder:

- [`../skills/producer-pal/ppal.mjs`](../skills/producer-pal/ppal.mjs) — CLI +
  library, Node 18+

## Python

- [`ppal.py`](./ppal.py) — CLI + library, Python 3.6+

The REST API returns JSON by default, so `result` comes back as a parsed value
and warnings are surfaced as a separate `warnings` array. See the
[REST API guide](https://producer-pal.org/guide/rest-api) for protocol details.
