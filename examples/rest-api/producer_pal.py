#!/usr/bin/env python3

"""Producer Pal REST API example (Python, no dependencies).

Usage: python producer_pal.py
"""

import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = "http://localhost:3350"


def list_tools():
    """List all available tools."""
    req = urllib.request.Request(f"{BASE_URL}/api/tools")
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read())["tools"]


def call_tool(name, args=None, *, format=None, timeout_ms=None):
    """Call a Producer Pal tool by name.

    Args:
        name:       Tool name (e.g. "ppal-read-live-set").
        args:       Tool input dict. Defaults to {}.
        format:     "json" or "compact". Default "compact" returns `result`
                    as a token-efficient JS-literal string. "json" returns
                    `result` as a parsed value (dict/list/etc.) and surfaces
                    any warnings as a separate `warnings` list.
        timeout_ms: Per-request timeout override (1-60000).
    """
    params = {}
    if format:
        params["format"] = format
    if timeout_ms is not None:
        params["timeoutMs"] = str(timeout_ms)

    url = f"{BASE_URL}/api/tools/{name}"
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"

    data = json.dumps(args or {}).encode()
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read())


def main():
    # List available tools
    print("Available tools:")
    tools = list_tools()
    for tool in tools:
        print(f"  {tool['name']} - {tool['description'][:60]}...")

    # Inspect a tool's input schema
    read_track = next(t for t in tools if t["name"] == "ppal-read-track")
    print(f"\nSchema for {read_track['name']}:")
    print(json.dumps(read_track["inputSchema"], indent=2))

    # Read tracks in the Live Set (default compact format)
    print("\nReading tracks (compact format):")
    tracks = call_tool("ppal-read-live-set")
    print(tracks["result"])

    # Same call with format="json" — result is a parsed dict you can index into
    print("\nReading tracks (parsed JSON):")
    tracks_json = call_tool("ppal-read-live-set", format="json")
    print(f"tempo: {tracks_json['result']['tempo']}")
    print(f"scale: {tracks_json['result']['scale']}")

    # Override timeout for a potentially long call
    print("\nReading track 0 with all clips (10s timeout):")
    track = call_tool(
        "ppal-read-track",
        {"trackIndex": 0, "include": ["session-clips", "arrangement-clips"]},
        timeout_ms=10000,
    )
    print(track["result"])


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
