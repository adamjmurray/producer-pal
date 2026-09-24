# Producer Pal
# Copyright (C) 2026 Adam Murray
# AI assistance: Claude (Anthropic)
# SPDX-License-Identifier: GPL-3.0-or-later

"""The remote script itself: the main-thread pump and Live's callback surface."""

import queue
import traceback

import Live

from .http_server import BridgeHTTPServer
from .routes import POST_ONLY, ROUTES, RouteError

PORT = 3349

# How long an HTTP request waits for Live's main thread to run it. Walking a big
# plugin folder for the first time is the slow case.
REQUEST_TIMEOUT = 30.0


class ProducerPalBridge:
    def __init__(self, c_instance):
        self._c_instance = c_instance
        self._jobs = queue.Queue()
        self._server = BridgeHTTPServer(PORT, self._dispatch, self.log)
        self._server.start()

    @property
    def song(self):
        return self._c_instance.song()

    @property
    def app(self):
        return Live.Application.get_application()

    def log(self, message):
        self._c_instance.log_message("[Producer Pal] " + str(message))

    # --- HTTP thread ---------------------------------------------------

    def _dispatch(self, method, path, params):
        """Called on an HTTP worker thread. Hands the work to the main thread and waits."""
        handler = ROUTES.get(path)
        if handler is None:
            return 404, {"error": "unknown route: " + path, "routes": sorted(ROUTES)}
        if path in POST_ONLY and method != "POST":
            return 405, {"error": "%s needs POST" % path}
        job = _Job(handler, self, params)
        self._jobs.put(job)
        return job.wait(REQUEST_TIMEOUT)

    # --- Live's main thread --------------------------------------------

    def update_display(self):
        """Live calls this ~10x/sec. It is the only place we touch the Live API."""
        while True:
            try:
                job = self._jobs.get_nowait()
            except queue.Empty:
                return
            job.run()

    def disconnect(self):
        self._server.stop()

    # --- the rest of what Live expects a control surface to have ---------

    def connect_script_instances(self, instances):
        pass

    def can_lock_to_devices(self):
        return False

    def lock_to_device(self, device):
        pass

    def unlock_from_device(self, device):
        pass

    def toggle_lock(self):
        pass

    def set_appointed_device(self, device):
        pass

    def suggest_input_port(self):
        return ""

    def suggest_output_port(self):
        return ""

    def suggest_map_mode(self, cc_no, channel):
        return Live.MidiMap.MapMode.absolute

    def supports_pad_translation(self):
        return False

    def show_message(self, message):
        self._c_instance.show_message(message)

    def request_rebuild_midi_map(self):
        self._c_instance.request_rebuild_midi_map()

    def build_midi_map(self, midi_map_handle):
        pass

    def receive_midi(self, midi_bytes):
        pass

    def handle_sysex(self, midi_bytes):
        pass

    def refresh_state(self):
        pass

    def is_extension(self):
        return False


class _Job:
    """One HTTP request, waiting to be run on Live's main thread."""

    def __init__(self, handler, bridge, params):
        self._handler = handler
        self._bridge = bridge
        self._params = params
        self._reply = queue.Queue(1)
        self._abandoned = False

    def run(self):
        # The HTTP side gave up: the caller may have torn down the track
        # it named, so running now would land on whatever took its place.
        if self._abandoned:
            return
        try:
            self._reply.put((200, self._handler(self._bridge, self._params)))
        except RouteError as err:
            self._reply.put((err.status, err.payload))
        except Exception as err:
            self._bridge.log("request failed:\n" + traceback.format_exc())
            self._reply.put(
                (
                    500,
                    {
                        "error": "%s: %s" % (type(err).__name__, err),
                        "traceback": traceback.format_exc(),
                    },
                )
            )

    def wait(self, timeout):
        try:
            return self._reply.get(timeout=timeout)
        except queue.Empty:
            self._abandoned = True
            return 504, {"error": "Live did not run the request within %ss" % timeout}
