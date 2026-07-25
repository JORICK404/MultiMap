import json
import threading
import urllib.error
import urllib.request

from endstone.event import ScriptMessageEvent, event_handler
from endstone.plugin import Plugin

TARGET_MESSAGE_ID = "region:territory_reply"

# The game sends the full territory list as several back-to-back scriptevent
# messages (each one a JSON array chunk), not a single message. We buffer
# chunks and flush once no new one has arrived for FLUSH_DELAY_SECONDS.
FLUSH_DELAY_SECONDS = 1.5

REGIONS_ENDPOINT = "https://multi-punk-map.vercel.app/api/regions"
REGIONS_TOKEN = "asddasdwwdwasd12asd"  # must match REGIONS_UPDATE_TOKEN in Vercel


class RegionBridge(Plugin):
    api_version = "0.11"

    def on_load(self) -> None:
        self.logger.info("on_load is called!")
        self._buffer = []
        self._timer = None
        self._lock = threading.Lock()

    def on_enable(self) -> None:
        self.register_events(self)
        self.logger.info(f"Watching for scriptevent id '{TARGET_MESSAGE_ID}'")

    def on_disable(self) -> None:
        self.logger.info("on_disable is called!")
        with self._lock:
            if self._timer:
                self._timer.cancel()

    @event_handler
    def on_script_message(self, event: ScriptMessageEvent) -> None:
        if event.message_id != TARGET_MESSAGE_ID:
            return

        try:
            chunk = json.loads(event.message)
        except ValueError:
            self.logger.warning(
                f"[RegionBridge] Could not parse chunk as JSON: {event.message[:200]}"
            )
            return

        with self._lock:
            self._buffer.append(chunk)
            if self._timer:
                self._timer.cancel()
            self._timer = threading.Timer(FLUSH_DELAY_SECONDS, self._flush)
            self._timer.daemon = True
            self._timer.start()

    def _flush(self) -> None:
        with self._lock:
            chunks, self._buffer = self._buffer, []
            self._timer = None

        merged = [item for chunk in chunks for item in chunk]
        if not merged:
            return

        payload = json.dumps(merged).encode("utf-8")
        request = urllib.request.Request(
            REGIONS_ENDPOINT,
            data=payload,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {REGIONS_TOKEN}",
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=10) as response:
                self.logger.info(
                    f"[RegionBridge] Sent {len(merged)} territories, status {response.status}"
                )
        except urllib.error.URLError as exc:
            self.logger.warning(f"[RegionBridge] Failed to send territories: {exc}")
