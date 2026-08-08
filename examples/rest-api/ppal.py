#!/usr/bin/env python3

"""Producer Pal REST API client (Python, no dependencies).

Usage:
  python ppal.py --list-tools [options]
  python ppal.py <tool-name> [json-args] [options]

Options:
  --url <baseUrl>          override Producer Pal URL (default http://localhost:3350)
  --timeout-ms <ms>        per-request timeout (1-60000)
  --disable-tools <names>  withhold tools from this request (comma-separated)

Examples:
  python ppal.py --list-tools
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

# Per-request tool subsetting. Unlike POST /config this changes nothing on the
# device: it applies to the one request that carries it, so it can't strip tools
# from the chat UI or another client.
DISABLED_TOOLS_HEADER = "x-producer-pal-disabled-tools"


def disabled_tools_headers(disabled_tools):
    """Headers withholding the given tools, or none when the list is empty.

    `disabled_tools` is a comma-separated string or a list of tool names.
    """
    names = disabled_tools if isinstance(disabled_tools, str) else ",".join(disabled_tools or [])
    return {DISABLED_TOOLS_HEADER: names} if names.strip() else {}


def list_tools(base_url, *, disabled_tools=None):
    """GET /api/tools — returns the full envelope `{"tools": [...]}` as a dict.

    The tool list endpoint always returns JSON; it has no `?format` toggle.
    `disabled_tools` withholds tools from this catalog.
    """
    req = urllib.request.Request(
        f"{base_url}/api/tools",
        headers=disabled_tools_headers(disabled_tools),
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read())


def call_tool(base_url, name, args, *, timeout_ms=None, disabled_tools=None):
    """Call a Producer Pal tool by name with the given args.

    The REST API defaults to `format=json`, so `result` is a parsed value
    (dict/list/etc.) and warnings are surfaced as a separate `warnings` list.

    `disabled_tools` withholds tools from this request: a withheld tool 404s,
    and `ppal-connect` returns a Skills blob with the fragments teaching those
    tools left out. Pass the same list on every call in a session.
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
            **disabled_tools_headers(disabled_tools),
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
            "  python ppal.py --list-tools\n"
            "  python ppal.py ppal-read-live-set\n"
            '  python ppal.py ppal-read-track \'{"trackIndex": 0}\''
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
    parsed = parser.parse_args()

    if parsed.list_tools:
        listing = list_tools(parsed.url, disabled_tools=parsed.disabled_tools)
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
