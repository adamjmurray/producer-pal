#!/usr/bin/env python3

"""Producer Pal REST API client (Python, no dependencies).

Usage:
  python ppal.py --list-tools [options]
  python ppal.py <tool-name> [json-args] [options]

Options:
  --url <baseUrl>      override Producer Pal URL (default http://localhost:3350)
  --timeout-ms <ms>    per-request timeout (1-60000)

Examples:
  python ppal.py --list-tools
  python ppal.py ppal-read-live-set
  python ppal.py ppal-read-track '{"trackIndex": 0}'
  python ppal.py --list-tools | jq -r '.tools[].name'
  python ppal.py ppal-read-live-set | jq .result.tempo
"""

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request


def list_tools(base_url):
    """GET /api/tools — returns the full envelope `{"tools": [...]}` as a dict.

    The tool list endpoint always returns JSON; it has no `?format` toggle.
    """
    req = urllib.request.Request(f"{base_url}/api/tools")
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read())


def call_tool(base_url, name, args, *, timeout_ms=None):
    """Call a Producer Pal tool by name with the given args.

    The REST API defaults to `format=json`, so `result` is a parsed value
    (dict/list/etc.) and warnings are surfaced as a separate `warnings` list.
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
        headers={"Content-Type": "application/json"},
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
    parsed = parser.parse_args()

    if parsed.list_tools:
        print(json.dumps(list_tools(parsed.url), indent=2))
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
