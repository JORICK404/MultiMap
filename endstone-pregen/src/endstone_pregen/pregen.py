import json

from endstone.command import Command, CommandSender
from endstone.level import Dimension
from endstone.plugin import Plugin

VERSION = "0.3.1"

# ---- Что прогружать -------------------------------------------------------
RADIUS = 3000        # мир от -RADIUS до +RADIUS блоков
SKIP_INNER = 2000    # квадрат ±SKIP_INNER уже разведан и пропускается (0 = грузить всё)

# ---- Насколько аккуратно --------------------------------------------------
CELL_CHUNKS = 10     # одна зона — квадрат 10×10 чанков (лимит тикающей зоны — 100)
PARALLEL = 4         # сколько зон грузить одновременно (1 = самый щадящий режим, максимум 10)
MIN_HOLD = 3         # минимум секунд держать зоны загруженными
SETTLE = 2           # сколько секунд подряд все чанки должны числиться загруженными
MAX_HOLD = 30        # если за это время не догрузилось — идём дальше с предупреждением
FALLBACK_HOLD = 12   # сколько держать, если узнать список загруженных чанков не удалось
AFTER_TOUCH = 1      # сколько ещё держать зоны после «касания» чанков
REST = 2             # пауза между заходами, секунд
MIN_TPS = 18.0       # ниже этого TPS новые шаги не начинаются, пока сервер не отдышится
LOG_EVERY = 10       # писать прогресс в консоль раз в столько заходов

AREA_NAME = "pregen_tmp"

# Bedrock пишет на диск только те чанки, в которых что-то изменилось после
# генерации; нетронутые он просто выбрасывает при выгрузке (проверено чтением
# базы мира: без этого сохранялось 15–60% зоны). Поэтому в каждом чанке на
# самой верхней высоте ставится и тут же убирается один блок.
TOUCH_Y = 319
TOUCH_BLOCK = "minecraft:glass"


def build_cells():
    """Квадраты CELL_CHUNKS×CELL_CHUNKS чанков, от центра к краям."""
    cmin, cmax = -RADIUS // 16, RADIUS // 16
    cells = []
    for cz in range(cmin, cmax + 1, CELL_CHUNKS):
        for cx in range(cmin, cmax + 1, CELL_CHUNKS):
            x2, z2 = min(cx + CELL_CHUNKS - 1, cmax), min(cz + CELL_CHUNKS - 1, cmax)
            blocks = (cx * 16, cz * 16, x2 * 16 + 15, z2 * 16 + 15)
            if SKIP_INNER and all(abs(v) <= SKIP_INNER for v in blocks):
                continue
            cells.append((cx, cz, x2, z2))
    cells.sort(key=lambda c: max(abs(c[0] + c[2]), abs(c[1] + c[3])))
    return cells


class Pregen(Plugin):
    api_version = "0.11"

    commands = {
        "pregen": {
            "description": "Неспешная прогрузка новых чанков мира",
            "usages": ["/pregen (start|stop|status|reset)<action: PregenAction>"],
            "permissions": ["pregen.command.use"],
        }
    }
    permissions = {
        "pregen.command.use": {
            "description": "Управление прогрузкой чанков",
            "default": "op",
        }
    }

    def on_enable(self) -> None:
        self._cells = build_cells()
        self._index = self._load_progress()
        self._running = False
        self._phase = "next"      # next -> hold -> touched -> rest -> next
        self._elapsed = 0
        self._settled = 0
        self._timeouts = 0
        self._untouched = 0
        self._check_works = True
        self._batch = []          # зоны, которые загружены прямо сейчас
        self._rounds = 0
        self._overworld = None
        self.server.scheduler.run_task(self, self._tick, delay=20, period=20)
        self.logger.info(
            f"v{VERSION}: {len(self._cells)} зон по {PARALLEL} за раз, сделано {self._index}. "
            f"Запуск: /pregen start"
        )

    def on_disable(self) -> None:
        if self._running:
            self._remove_area()
            self._save_progress()

    # ---- команды -----------------------------------------------------------

    def on_command(self, sender: CommandSender, command: Command, args: list[str]) -> bool:
        if command.name != "pregen":
            return False
        action = args[0] if args else "status"

        if action == "start":
            if self._index >= len(self._cells):
                sender.send_message("[Pregen] Всё уже прогружено. /pregen reset — начать заново.")
            elif self._running:
                sender.send_message("[Pregen] Уже работает. " + self._status())
            else:
                # На случай, если зоны остались после падения сервера. Если их нет,
                # сервер напишет «No ticking areas named ...» на каждую — это нормально.
                self._remove_area(force=True)
                self._running, self._phase = True, "next"
                sender.send_message("[Pregen] Запущено. " + self._status())
        elif action == "stop":
            if self._running:
                self._running = False
                self._remove_area()
                self._save_progress()
            sender.send_message("[Pregen] Остановлено, прогресс сохранён. " + self._status())
        elif action == "reset":
            if self._running:
                self._running = False
                self._remove_area()
            self._index = 0
            self._save_progress()
            sender.send_message("[Pregen] Прогресс сброшен.")
        else:
            sender.send_message("[Pregen] " + self._status())
        return True

    def _status(self) -> str:
        total, done = len(self._cells), self._index
        left_min = -(-(total - done) // PARALLEL) * (MIN_HOLD + AFTER_TOUCH + REST + 2) / 60
        state = "работает" if self._running else "стоит"
        return (
            f"{state}: {done}/{total} зон ({done * 100 // max(total, 1)}%), "
            f"осталось примерно {left_min:.0f} мин, TPS {self.server.current_tps:.1f}, "
            f"не догрузилось за отведённое время: {self._timeouts}, "
            f"чанков без «касания»: {self._untouched}"
        )

    # ---- основной цикл (раз в секунду, в главном потоке сервера) -----------

    def _tick(self) -> None:
        if not self._running:
            return

        if self._phase == "next":
            if self._index >= len(self._cells):
                self._running = False
                self._save_progress()
                self.logger.info(f"Готово! Плагин можно удалять. {self._status()}")
                return
            if self.server.current_tps < MIN_TPS:
                return  # сервер занят — ждём, ничего не грузим
            for cell in self._cells[self._index:self._index + PARALLEL]:
                cx, cz, x2, z2 = cell
                ok = self._command(
                    f"tickingarea add {cx * 16} 0 {cz * 16} {x2 * 16 + 15} 0 {z2 * 16 + 15} "
                    f"{AREA_NAME}_{len(self._batch)}"
                )
                if not ok:
                    self._running = False
                    self._remove_area()
                    self.logger.error(
                        "Не удалось создать тикающую зону (возможно, занят лимит в 10 зон: "
                        "/tickingarea list). Остановлено."
                    )
                    return
                self._batch.append(cell)
            self._phase, self._elapsed, self._settled = "hold", 0, 0

        elif self._phase == "hold":
            self._elapsed += 1
            loaded = self._cell_loaded()
            if loaded is None:  # проверить не можем — просто держим фиксированное время
                done = self._elapsed >= FALLBACK_HOLD
            else:
                self._settled = self._settled + 1 if loaded else 0
                done = self._elapsed >= MIN_HOLD and self._settled >= SETTLE
                if not done and self._elapsed >= MAX_HOLD:
                    done = True
                    self._timeouts += 1
                    self.logger.warning(
                        f"Зоны с {self._index} не догрузились за {MAX_HOLD} с, иду дальше."
                    )
            if done:
                for cell in self._batch:
                    self._touch_cell(cell)
                self._phase, self._elapsed = "touched", 0

        elif self._phase == "touched":
            self._elapsed += 1
            if self._elapsed >= AFTER_TOUCH:
                self._index += len(self._batch)
                self._remove_area()
                self._save_progress()
                self._rounds += 1
                if self._rounds % LOG_EVERY == 0:
                    self.logger.info(self._status())
                self._phase, self._elapsed = "rest", 0

        elif self._phase == "rest":
            self._elapsed += 1
            if self._elapsed >= REST:
                self._phase = "next"

    def _cell_loaded(self):
        """True/False — загружены ли все чанки текущих зон; None — узнать не удалось."""
        if not self._check_works:
            return None
        try:
            need = sum((x2 - cx + 1) * (z2 - cz + 1) for cx, cz, x2, z2 in self._batch)
            have = sum(
                1
                for c in self._get_overworld().loaded_chunks
                if any(cx <= c.x <= x2 and cz <= c.z <= z2 for cx, cz, x2, z2 in self._batch)
            )
            return have >= need
        except Exception as exc:
            self._check_works = False
            self.logger.warning(
                f"Не получается проверить загрузку чанков ({exc!r}), "
                f"держу каждую зону по {FALLBACK_HOLD} с."
            )
            return None

    def _touch_cell(self, cell) -> None:
        """Помечает все чанки зоны изменёнными, чтобы сервер записал их на диск."""
        cx, cz, x2, z2 = cell
        try:
            dim = self._get_overworld()
            for x in range(cx, x2 + 1):
                for z in range(cz, z2 + 1):
                    block = dim.get_block_at(x * 16, TOUCH_Y, z * 16)
                    if block.type != "minecraft:air":
                        continue  # тут что-то построено — такой чанк и так сохранён
                    block.set_type(TOUCH_BLOCK, False)
                    block.set_type("minecraft:air", False)
        except Exception as exc:
            self._untouched += (x2 - cx + 1) * (z2 - cz + 1)
            self.logger.warning(f"Зона {cell}: не удалось «коснуться» чанков: {exc!r}")

    def _get_overworld(self):
        if self._overworld is None:
            self._overworld = next(
                d for d in self.server.level.dimensions if d.type == Dimension.OVERWORLD
            )
        return self._overworld

    # ---- мелочи ------------------------------------------------------------

    def _command(self, line: str) -> bool:
        return self.server.dispatch_command(self.server.command_sender, line)

    def _remove_area(self, force: bool = False) -> None:
        for i in range(PARALLEL if force else len(self._batch)):
            self._command(f"tickingarea remove {AREA_NAME}_{i}")
        self._batch = []

    def _progress_file(self):
        return self.data_folder / "progress.json"

    def _load_progress(self) -> int:
        try:
            data = json.loads(self._progress_file().read_text(encoding="utf-8"))
            # Прогресс годится только для тех же настроек области.
            if data.get("key") == [RADIUS, SKIP_INNER, CELL_CHUNKS]:
                return int(data["index"])
        except (OSError, ValueError, KeyError):
            pass
        return 0

    def _save_progress(self) -> None:
        try:
            self.data_folder.mkdir(parents=True, exist_ok=True)
            self._progress_file().write_text(
                json.dumps({"key": [RADIUS, SKIP_INNER, CELL_CHUNKS], "index": self._index}),
                encoding="utf-8",
            )
        except OSError as exc:
            self.logger.warning(f"Не удалось сохранить прогресс: {exc}")
