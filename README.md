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
| `TEAM_VAULT_URL`        | да    | URL сервера, напр. `https://obsidian.artillect.pro`                    |
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

Гейты: `pnpm typecheck && pnpm format:check && pnpm build`.

## Подключение в Claude Code / MCP-клиенте

```json
{
  "mcpServers": {
    "team-vault": {
      "command": "node",
      "args": ["/абсолютный/путь/TeamVaultMCP/dist/index.js"],
      "env": {
        "TEAM_VAULT_URL": "https://obsidian.artillect.pro",
        "TEAM_VAULT_API_KEY": "osync_…",
        "TEAM_VAULT_PROJECT_ID": "cmq…"
      }
    }
  }
}
```

## Лицензия

MIT · krem.digital
