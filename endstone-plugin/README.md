# endstone-region-bridge

Тестовый плагин Endstone: слушает `ScriptMessageEvent` (событие от команды
`/scriptevent`) и если `message_id` равен `region:territory_reply`, пишет
`message` в консоль сервера.

Названия следуют официальной конвенции Endstone (см. [Create your first
plugin](https://endstone.dev/stable/tutorials/create-your-first-plugin/)):
имя дистрибутива и папка пакета обязаны начинаться с `endstone-`/`endstone_`,
иначе загрузчик плагинов откажется его подключать.

```
endstone-plugin/
├── pyproject.toml
└── src/endstone_region_bridge/
    ├── __init__.py
    └── region_bridge.py
```

## Сборка и установка

```bash
pip install build
python -m build
```

Полученный `.whl` из `dist/` кладётся в папку `plugins/` сервера Endstone.

Либо для разработки — editable-режим прямо в окружении сервера:

```bash
pip install -e .
```
(после `/reload` в игре плагин подхватит изменения кода без перезапуска сервера)

Если раньше уже стоял старый вариант без префикса `endstone-` — снесите его
перед установкой нового:

```bash
pip uninstall region-bridge -y
```

## Проверка

В игре или консоли сервера:

```
/scriptevent region:territory_reply hello world
```

В логе должно появиться `[RegionBridge] hello world`.
