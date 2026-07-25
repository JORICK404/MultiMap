from endstone.event import ScriptMessageEvent, event_handler
from endstone.plugin import Plugin

TARGET_MESSAGE_ID = "region:territory_reply"


class RegionBridge(Plugin):
    api_version = "0.11"

    def on_load(self) -> None:
        self.logger.info("on_load is called!")

    def on_enable(self) -> None:
        self.register_events(self)
        self.logger.info(f"Watching for scriptevent id '{TARGET_MESSAGE_ID}'")

    def on_disable(self) -> None:
        self.logger.info("on_disable is called!")

    @event_handler
    def on_script_message(self, event: ScriptMessageEvent) -> None:
        if event.message_id != TARGET_MESSAGE_ID:
            return
        self.logger.info(event.message)
