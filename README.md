# Team Vault MCP

[MCP](https://modelcontextprotocol.io)-сервер, который отдаёт REST API Team Vault
как набор инструментов для ИИ-агентов. Позволяет другим агентам **читать и
править заметки вальта программно**, без Obsidian — поверх того же серверного
API, что использует плагин.

Транспорт — **stdio** (агент запускает процесс и общается по JSON-RPC).
Аутентификация — заголовок `X-API-Key`.

## Конфигурация (env)

| Переменная              | Обяз. | Описание                                                               |
| ----------------------- | ----- | ---------------------------------------------------------------------- |
| `TEAM_VAULT_URL`        | да    | URL сервера, напр. `https://teamvault.artillect.pro`                   |
| `TEAM_VAULT_API_KEY`    | да    | API-ключ Team Vault (веб-UI → API-ключи)                               |
| `TEAM_VAULT_PROJECT_ID` | нет   | проект по умолчанию для инструментов без `projectId`                   |
| `TEAM_VAULT_READ_ONLY`  | нет   | `1`/`true` — отключить запись (`write_note`/`move_note`/`delete_note`) |

## Инструменты

| Инструмент           | Режим  | Что делает                                       |
| -------------------- | ------ | ------------------------------------------------ |
| `whoami`             | чтение | владелец API-ключа                               |
| `list_projects`      | чтение | доступные проекты (id, slug, name)               |
| `list_notes`         | чтение | пути файлов проекта (`prefix` — фильтр по папке) |
| `read_note`          | чтение | содержимое текстовой заметки по пути             |
| `list_note_versions` | чтение | история версий файла                             |
| `write_note`         | запись | создать/перезаписать заметку по пути             |
| `move_note`          | запись | переместить/переименовать                        |
| `delete_note`        | запись | мягко удалить (tombstone, восстановимо)          |

Инструменты **путь-ориентированы**: агент оперирует путями (`персонажи/кузьма-минин.md`),
а MCP сам резолвит путь ↔ fileId. В `read_only`-режиме инструменты записи не
регистрируются вовсе.

## Сборка и запуск

```bash
pnpm install
pnpm build          # tsup → dist/index.js (один бандл)
TEAM_VAULT_URL=… TEAM_VAULT_API_KEY=… node dist/index.js
```

Гейты: `pnpm typecheck && pnpm format:check && pnpm build && pnpm test`.

## Тесты

```bash
pnpm test           # vitest run (однократно); pnpm test:watch — в режиме наблюдения
```

Тесты не ходят в сеть: глобальный `fetch` в каждом тесте подменён заглушкой
(`tests/setup.ts`), а тест, которому нужен HTTP, ставит свой мок с ответами
сервера (`tests/helpers/fetch.ts`). Клиент перехватывает ошибку заглушки и
превращает её в обычную `TeamVaultError`, поэтому заглушка ещё и запоминает
каждый вызов: тест, который забыл мок, падает после выполнения, даже если сам
ждал ошибку.

- `tests/client.test.ts` — REST-клиент: заголовок `X-API-Key`, резолв пути
  через `GET /files?path=…` (включая `200` с пустым списком), `404`,
  `409 path_exists`, `5xx`, сетевые ошибки.
- `tests/server.test.ts` — инструменты через настоящий MCP-клиент поверх
  in-memory транспорта: режим только для чтения, `write_note` (создание и
  обновление), чтение, перемещение, удаление.
- `tests/config.test.ts` — разбор переменных окружения.
- `tests/entry.test.ts` — точка входа `src/index.ts` как дочерний процесс по stdio
  (`initialize` + `tools/list`, выход с кодом 1 без обязательных переменных).
- `tests/network-guard.test.ts` — заглушка `fetch`: юнит-проверки и дочерний
  прогон vitest на `tests/fixtures/*.fixture.ts` (основной прогон эти файлы
  не собирает).

## Подключение в Claude Code / MCP-клиенте

```json
{
  "mcpServers": {
    "team-vault": {
      "command": "node",
      "args": ["/абсолютный/путь/TeamVaultMCP/dist/index.js"],
      "env": {
        "TEAM_VAULT_URL": "https://teamvault.artillect.pro",
        "TEAM_VAULT_API_KEY": "osync_…",
        "TEAM_VAULT_PROJECT_ID": "cmq…"
      }
    }
  }
}
```

## Лицензия

MIT · krem.digital
