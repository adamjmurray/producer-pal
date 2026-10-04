# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""The HTTP front door. Runs on its own thread and never touches the Live API."""

import json
import os
import socket
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
from urllib.parse import parse_qs, urlparse, urlsplit

# A Host outside these is a DNS-rebinding page reaching us under its own name.
LOOPBACK_HOSTS = ("127.0.0.1", "localhost", "::1")

# Where we tell clients which port we got. The MCP server reads it; no file
# means an older script on 3349.
PORT_FILE = os.path.join(
    os.path.expanduser("~"), ".producer-pal", "remote-script-port.txt"
)


class BridgeHTTPServer:
    """Owns the listening socket and its thread.

    `dispatch(method, path, params)` is called on an HTTP worker thread and must
    return `(status, payload)`. It is responsible for hopping to Live's main
    thread.

    Takes the first of `ports` it can bind, since another Live (or another
    program) may hold the usual one, and records it in `port_file`.
    """

    def __init__(self, ports, dispatch, log, port_file=PORT_FILE):
        self._ports = tuple(ports)
        self._dispatch = dispatch
        self._log = log
        self._port_file = port_file
        self._server = None
        self._thread = None
        # The port we bound, or None before `start` succeeds.
        self.port = None

    def start(self):
        """Bind a port and start serving. Returns True on success."""
        for port in self._ports:
            if _answers(port):
                self._log("port %s is in use" % port)
                continue
            try:
                self._server = _Server(("127.0.0.1", port), _Handler)
            except OSError as err:
                self._log("could not bind port %s: %s" % (port, err))
                continue
            self.port = port
            break
        else:
            self._log("no free port among %s" % ", ".join(map(str, self._ports)))
            return False
        self._server.dispatch = self._dispatch
        self._server.log = self._log
        self._thread = Thread(target=self._serve, name="Producer Pal", daemon=True)
        self._thread.start()
        self._log("listening on http://127.0.0.1:%s" % self.port)
        self._write_port_file()
        return True

    def stop(self):
        """Close the socket. Safe to call from the main thread, never from a worker."""
        if self._server is None:
            return
        self._server.shutdown()
        self._server.server_close()
        self._server = None
        self._log("stopped")

    def _write_port_file(self):
        try:
            os.makedirs(os.path.dirname(self._port_file), exist_ok=True)
            # Replace in one step so a reader never sees half a number.
            temp = "%s.tmp.%s" % (self._port_file, os.getpid())
            with open(temp, "w") as file:
                file.write("%s\n" % self.port)
            os.replace(temp, self._port_file)
        except OSError as err:
            self._log("could not write %s: %s" % (self._port_file, err))

    def _serve(self):
        try:
            self._server.serve_forever(poll_interval=0.2)
        except Exception:
            self._log("server thread died:\n" + traceback.format_exc())


class _Server(ThreadingHTTPServer):
    # On Windows this lets a second bind succeed on a port already in use,
    # so the fallback to the next port would never happen.
    allow_reuse_address = sys.platform != "win32"
    daemon_threads = True


class _Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self):
        if not self._allowed():
            return
        path, params = self._parse_url()
        self._respond(path, params)

    def do_POST(self):
        if not self._allowed():
            return
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

    def _allowed(self):
        """Refuse any request a web page could have sent. Returns False if refused."""
        # Browsers send Origin on every POST and cross-origin request (even
        # "null"), and Sec-Fetch-Site on nearly every request, <img> GETs
        # included; our own clients send neither.
        if (
            self.headers.get("Origin") is not None
            or self.headers.get("Sec-Fetch-Site") is not None
        ):
            error = "requests from a web page are refused"
        elif _hostname(self.headers.get("Host")) not in LOOPBACK_HOSTS:
            error = "Host must be 127.0.0.1 or localhost"
        else:
            return True
        # The body is unread, so it can't stay on the connection.
        self.close_connection = True
        self._send(403, {"error": error})
        return False

    def _parse_url(self):
        parsed = urlparse(self.path)
        params = {key: values[0] for key, values in parse_qs(parsed.query).items()}
        return parsed.path.rstrip("/") or "/", params

    def _respond(self, path, params):
        try:
            status, payload = self.server.dispatch(self.command, path, params)
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


def _answers(port):
    """Whether something already accepts connections on 127.0.0.1:`port`.

    Binding alone can't tell: with SO_REUSEADDR (kept on macOS so a quick
    restart isn't refused during TIME_WAIT) a bind to 127.0.0.1 succeeds even
    when another program listens on the wildcard address.
    """
    try:
        socket.create_connection(("127.0.0.1", port), timeout=0.25).close()
        return True
    except OSError:
        return False


def _hostname(host):
    """The lowercase hostname of a Host header, or None when it has none."""
    try:
        return urlsplit("//" + host).hostname if host else None
    except ValueError:
        return None
