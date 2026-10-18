#!/usr/bin/env bash
# Рендерит карту мира (1 пиксель = 1 блок) из бэкапа сервера через unmined-cli.
#
# Использование:
#   bash render_map.sh                         — самый свежий бэкап из BACKUPS_DIR
#   bash render_map.sh "путь к папке бэкапа"   — конкретный бэкап
#   bash render_map.sh "путь" куда/map.png     — и куда сохранить картинку
#
# Настройки рендера: 3D-тени включены, «Cartographic elevation gradient» выключен.
# Сам бэкап не трогается: мир сначала копируется во временную папку.
set -euo pipefail

BACKUPS_DIR="/home/multi/multi-punk/servers/survival/backups/hourly"
BACKUP="${1:-}"
OUTPUT="${2:-$HOME/map-render/map.png}"
FRESH_SECONDS=120                 # бэкап, в который писали позже этого, считается недокопированным

# Самый свежий бэкап. Имена вида «2026-10-11 16-55-48 (Sunday)» при сортировке
# по алфавиту идут по дате. Если в последний бэкап ещё пишутся файлы, берётся
# предыдущий, чтобы не рендерить мир наполовину.
if [ -z "$BACKUP" ]; then
    mapfile -t CANDIDATES < <(find "$BACKUPS_DIR" -mindepth 1 -maxdepth 1 -type d \
        -name '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] *' | sort -r)
    for dir in "${CANDIDATES[@]}"; do
        if [ -n "$(find "$dir" -newermt "-$FRESH_SECONDS seconds" -print -quit)" ]; then
            echo "== Пропускаю $(basename "$dir"): в него ещё пишутся файлы"
            continue
        fi
        BACKUP="$dir"
        break
    done
    if [ -z "$BACKUP" ]; then
        echo "!! Не найдено ни одного готового бэкапа в $BACKUPS_DIR" >&2
        exit 1
    fi
fi
echo "== Бэкап: $BACKUP"

RADIUS=3000                       # карта от -RADIUS до +RADIUS блоков
WORK_DIR="$HOME/map-render"       # сюда ставится unmined-cli и кладётся временная копия мира
UNMINED_URL="https://unmined.net/download/unmined-cli-linux-x64-dev/"
THREADS="${THREADS:-2}"           # сколько чанков рендерить одновременно (меньше = мягче для сервера)

mkdir -p "$WORK_DIR" "$(dirname "$OUTPUT")"

# ---- 1. unmined-cli: скачивается один раз -----------------------------------
CLI_DIR="$(find "$WORK_DIR" -maxdepth 1 -type d -name 'unmined-cli_*' | sort | tail -n 1)"
if [ -z "$CLI_DIR" ]; then
    echo "== Скачиваю unmined-cli..."
    curl -fL --retry 3 -o "$WORK_DIR/unmined-cli.tar.gz" "$UNMINED_URL"
    tar xzf "$WORK_DIR/unmined-cli.tar.gz" -C "$WORK_DIR"
    rm "$WORK_DIR/unmined-cli.tar.gz"
    CLI_DIR="$(find "$WORK_DIR" -maxdepth 1 -type d -name 'unmined-cli_*' | sort | tail -n 1)"
fi
chmod +x "$CLI_DIR/unmined-cli"

# В консольной версии нет галочки «Cartographic elevation gradient», поэтому
# выключаем её значение по умолчанию прямо в таблице стилей.
STYLE="$CLI_DIR/config/default/default.stylesheet.minecraft.js"
sed -i 's/\(c\.bool(SettingName\.useLandElevationGradient, "Cartographic elevation gradient", \)true)/\1false)/' "$STYLE"
if ! grep -q '"Cartographic elevation gradient", false)' "$STYLE"; then
    echo "!! Не удалось выключить elevation gradient в $STYLE (формат файла изменился?)" >&2
    exit 1
fi

# ---- 2. Находим мир внутри бэкапа и копируем его ----------------------------
LEVEL_DAT="$(find "$BACKUP" -maxdepth 4 -name level.dat -print -quit)"
if [ -z "$LEVEL_DAT" ]; then
    echo "!! В бэкапе не найден level.dat: $BACKUP" >&2
    exit 1
fi
WORLD_SRC="$(dirname "$LEVEL_DAT")"
WORLD_TMP="$WORK_DIR/world-copy"
echo "== Мир: $WORLD_SRC ($(du -sh "$WORLD_SRC" | cut -f1))"
rm -rf "$WORLD_TMP"
trap 'rm -rf "$WORLD_TMP"' EXIT
nice -n 19 cp -r "$WORLD_SRC" "$WORLD_TMP"

# ---- 3. Рендер ---------------------------------------------------------------
echo "== Рендерю ${RADIUS}x${RADIUS} вокруг нуля, потоков: $THREADS..."
export DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1   # чтобы не требовалась библиотека ICU
nice -n 19 "$CLI_DIR/unmined-cli" image render \
    --world="$WORLD_TMP" \
    --output="$OUTPUT" \
    --area="b((-$RADIUS,-$RADIUS),($RADIUS,$RADIUS))" \
    --dimension=0 \
    --zoom=0 \
    --shadows=3d \
    --chunkprocessors="$THREADS" \
    -c

echo "== Готово: $OUTPUT ($(du -h "$OUTPUT" | cut -f1))"
