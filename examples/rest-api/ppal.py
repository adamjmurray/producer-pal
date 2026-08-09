#!/usr/bin/env python3

"""Producer Pal REST API client (Python, no dependencies).

Usage:
  python ppal.py --list-tools [options]
  python ppal.py <tool-name> [json-args] [options]

Options:
  --url <baseUrl>          override Producer Pal URL (default http://localhost:3350)
  --timeout-ms <ms>        per-request timeout (1-60000)
  --notation <name>        barbeat | midi-json | stark, for this request only
  --disable-tools <names>  withhold tools from this request (comma-separated)
  --small-model-mode       shrink tool schemas and Skills for this request

Examples:
  python ppal.py --list-tools --notation midi-json
  python ppal.py ppal-read-live-set
  python ppal.py ppal-read-track '{"trackIndex": 0}'
  python ppal.py --list-tools | jq -r '.tools[].name'
  python ppal.py ppal-read-live-set | jq .result.tempo
  python ppal.py ppal-connect --disable-tools ppal-library,ppal-create-device
"""

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

# The three per-request headers. Unlike POST /config these change nothing on the
# device: each applies to the one request that carries it, so it can't move the
# chat UI or another client off its own notation or toolset. Absent ⇒ that client
# keeps the device's global setting.
DISABLED_TOOLS_HEADER = "x-producer-pal-disabled-tools"
NOTATION_HEADER = "x-producer-pal-notation"
SMALL_MODEL_MODE_HEADER = "x-producer-pal-small-model-mode"


def profile_headers(*, disabled_tools=None, notation=None, small_model_mode=None):
    """Headers for this call's profile, omitting whichever values are absent.

    `disabled_tools` is a comma-separated string or a list of tool names;
    `notation` is "barbeat", "midi-json", or "stark"; `small_model_mode` is a
    bool. Nothing is remembered between requests, so pass the same values on
    every call in a session — the list_tools call included, so the schemas you
    read match the notation you'll write.
    """
    names = disabled_tools if isinstance(disabled_tools, str) else ",".join(disabled_tools or [])
    headers = {}
    if names.strip():
        headers[DISABLED_TOOLS_HEADER] = names
    if notation:
        headers[NOTATION_HEADER] = notation
    if small_model_mode is not None:
        headers[SMALL_MODEL_MODE_HEADER] = "true" if small_model_mode else "false"
    return headers


def list_tools(base_url, *, disabled_tools=None, notation=None, small_model_mode=None):
    """GET /api/tools — returns the full envelope `{"tools": [...]}` as a dict.

    The tool list endpoint always returns JSON; it has no `?format` toggle. The
    profile arguments shape the catalog: withheld tools are omitted, and the
    descriptions and schemas resolve against this request's notation and
    small-model mode.
    """
    req = urllib.request.Request(
        f"{base_url}/api/tools",
        headers=profile_headers(
            disabled_tools=disabled_tools,
            notation=notation,
            small_model_mode=small_model_mode,
        ),
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read())


def call_tool(
    base_url,
    name,
    args,
    *,
    timeout_ms=None,
    disabled_tools=None,
    notation=None,
    small_model_mode=None,
):
    """Call a Producer Pal tool by name with the given args.

    The REST API defaults to `format=json`, so `result` is a parsed value
    (dict/list/etc.) and warnings are surfaced as a separate `warnings` list.

    The profile arguments apply to this request: a withheld tool 404s,
    `ppal-connect` returns a Skills blob matching this request's notation and
    toolset, and `notation` also decides how notes in the arguments are parsed
    and how notes in the result are formatted.
    """
    params = {}
    if timeout_ms is not None:
        params["timeoutMs"] = str(timeout_ms)

    query = f"?{urllib.parse.urlencode(params)}" if params else ""
    url = f"{base_url}/api/tools/{name}{query}"
    data = json.dumps(args).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            **profile_headers(
                disabled_tools=disabled_tools,
                notation=notation,
                small_model_mode=small_model_mode,
            ),
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read())


def main():
    parser = argparse.ArgumentParser(
        description="Producer Pal REST API client",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python ppal.py --list-tools --notation midi-json\n"
            "  python ppal.py ppal-read-live-set\n"
            '  python ppal.py ppal-read-track \'{"trackIndex": 0}\'\n'
            "\n"
            "--notation, --disable-tools, and --small-model-mode apply to the ONE\n"
            "request that carries them. Pass them every time, --list-tools included."
        ),
    )
    parser.add_argument("tool", nargs="?", help="Tool name to call")
    parser.add_argument(
        "args",
        nargs="?",
        default="{}",
        help="Tool arguments as a JSON object (default: {})",
    )
    parser.add_argument("--url", default="http://localhost:3350")
    parser.add_argument("--timeout-ms", type=int, default=None, dest="timeout_ms")
    parser.add_argument("--list-tools", action="store_true", dest="list_tools")
    parser.add_argument(
        "--disable-tools",
        default=None,
        dest="disabled_tools",
        help="Comma-separated tool names to withhold from this request",
    )
    parser.add_argument(
        "--notation",
        default=None,
        choices=["barbeat", "midi-json", "stark"],
        help="MIDI notation for this request",
    )
    parser.add_argument(
        "--small-model-mode",
        action="store_true",
        default=None,
        dest="small_model_mode",
        help="Shrink tool schemas and Skills for this request",
    )
    parsed = parser.parse_args()

    if parsed.list_tools:
        listing = list_tools(
            parsed.url,
            disabled_tools=parsed.disabled_tools,
            notation=parsed.notation,
            small_model_mode=parsed.small_model_mode,
        )
        print(json.dumps(listing, indent=2))
        return

    if not parsed.tool:
        parser.error(
            "Missing tool name. Use --list-tools to discover tools, "
            "or pass a tool name as the first argument."
        )

    try:
        tool_args = json.loads(parsed.args)
    except json.JSONDecodeError as e:
        parser.error(f"Invalid JSON for tool args: {e}")

    response = call_tool(
        parsed.url,
        parsed.tool,
        tool_args,
        timeout_ms=parsed.timeout_ms,
        disabled_tools=parsed.disabled_tools,
        notation=parsed.notation,
        small_model_mode=parsed.small_model_mode,
    )
    if response.get("isError"):
        print(f"API error: {response['result']}", file=sys.stderr)
        sys.exit(1)
    print(json.dumps(response, indent=2))


if __name__ == "__main__":
    try:
        main()
    except urllib.error.URLError as e:
        if "Connection refused" in str(e.reason):
            print(
                "Could not connect to Producer Pal."
                " Is Ableton Live running with the Producer Pal device?",
                file=sys.stderr,
            )
        else:
            raise
        sys.exit(1)
