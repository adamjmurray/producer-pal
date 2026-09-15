# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""The HTTP front door. Runs on its own thread and never touches the Live API."""

import json
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from urllib.parse import parse_qs, urlparse


class BridgeHTTPServer:
    """Owns the listening socket and its thread.

    `dispatch(path, params)` is called on an HTTP worker thread and must return
    `(status, payload)`. It is responsible for hopping to Live's main thread.
    """

    def __init__(self, port, dispatch, log):
        self._port = port
        self._dispatch = dispatch
        self._log = log
        self._server = None
        self._thread = None

    def start(self):
        """Bind the port and start serving. Returns True on success."""
        try:
            self._server = _Server(("127.0.0.1", self._port), _Handler)
        except OSError as err:
            self._log("could not bind port %s: %s" % (self._port, err))
            return False
        self._server.dispatch = self._dispatch
        self._server.log = self._log
        self._thread = Thread(target=self._serve, name="Producer Pal", daemon=True)
        self._thread.start()
        self._log("listening on http://127.0.0.1:%s" % self._port)
        return True

    def stop(self):
        """Close the socket. Safe to call from the main thread, never from a worker."""
        if self._server is None:
            return
        self._server.shutdown()
        self._server.server_close()
        self._server = None
        self._log("stopped")

    def _serve(self):
        try:
            self._server.serve_forever(poll_interval=0.2)
        except Exception:
            self._log("server thread died:\n" + traceback.format_exc())


class _Server(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        path, params = self._parse_url()
        self._respond(path, params)

    def do_POST(self):
        path, params = self._parse_url()
        length = int(self.headers.get("Content-Length") or 0)
        raw = self.rfile.read(length) if length else b""
        if raw:
            try:
                body = json.loads(raw.decode("utf-8"))
            except ValueError as err:
                self._send(400, {"error": "invalid JSON body: %s" % err})
                return
            if not isinstance(body, dict):
                self._send(400, {"error": "JSON body must be an object"})
                return
            params.update(body)
        self._respond(path, params)

    def _parse_url(self):
        parsed = urlparse(self.path)
        params = {key: values[0] for key, values in parse_qs(parsed.query).items()}
        return parsed.path.rstrip("/") or "/", params

    def _respond(self, path, params):
        try:
            status, payload = self.server.dispatch(path, params)
        except Exception as err:
            status, payload = 500, {
                "error": "%s: %s" % (type(err).__name__, err),
                "traceback": traceback.format_exc(),
            }
        self._send(status, payload)

    def _send(self, status, payload):
        data = json.dumps(payload, indent=2, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):
        self.server.log("http: " + (fmt % args))
