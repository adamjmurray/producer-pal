#!/usr/bin/env python3

"""Producer Pal REST API example (Python, no dependencies).

Usage: python producer_pal.py
"""

import json
import sys
import urllib.error
import urllib.request

BASE_URL = "http://localhost:3350"


def list_tools():
    """List all available tools."""
    req = urllib.request.Request(f"{BASE_URL}/api/tools")
    with urllib.request.urlopen(req) as res:
        return json.loads(res.read())["tools"]


def call_tool(name, args=None):
    """Call a Producer Pal tool by name."""
    data = json.dumps(args or {}).encode()
    req = urllib.request.Request(
        f"{BASE_URL}/api/tools/{name}",
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

    # Read tracks in the Live Set
    print("\nReading tracks...")
    tracks = call_tool("ppal-read-live-set")
    print(tracks["result"])

    # Read a specific track with session clips
    print("\nReading track 0 with session clips...")
    track = call_tool("ppal-read-track", {
        "trackIndex": 0,
        "include": ["session-clips"],
    })
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
