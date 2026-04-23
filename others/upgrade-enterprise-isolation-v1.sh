#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="$ROOT_DIR/others"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose-on-linux.yml"
UPGRADE_DIR="$ROOT_DIR/database/upgrade"

MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-root}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-}"
SYSTEM_DATABASE="${SYSTEM_DATABASE:-myems_system_db}"

if [[ -z "$MYSQL_PASSWORD" ]]; then
  echo "MYSQL_PASSWORD is required. Export it before running this script." >&2
  exit 1
fi

mysql_exec() {
  MYSQL_PWD="$MYSQL_PASSWORD" mysql \
    -h "$MYSQL_HOST" \
    -P "$MYSQL_PORT" \
    -u "$MYSQL_USER" \
    "$@"
}

current_version="$(mysql_exec -N -s "$SYSTEM_DATABASE" -e "SELECT version FROM tbl_versions WHERE id = 1;")"

declare -a upgrade_scripts
case "$current_version" in
  6.3.0)
    upgrade_scripts=(upgrade6.3.1.sql upgrade6.3.2.sql upgrade6.3.3.sql upgrade6.3.4.sql)
    ;;
  6.3.1)
    upgrade_scripts=(upgrade6.3.2.sql upgrade6.3.3.sql upgrade6.3.4.sql)
    ;;
  6.3.2)
    upgrade_scripts=(upgrade6.3.3.sql upgrade6.3.4.sql)
    ;;
  6.3.3)
    upgrade_scripts=(upgrade6.3.4.sql)
    ;;
  6.3.4)
    upgrade_scripts=()
    ;;
  *)
    echo "Unsupported current database version: $current_version" >&2
    echo "Expected one of: 6.3.0, 6.3.1, 6.3.2, 6.3.3, 6.3.4" >&2
    exit 1
    ;;
esac

echo "Current database version: $current_version"

for script_name in "${upgrade_scripts[@]}"; do
  script_path="$UPGRADE_DIR/$script_name"
  if [[ ! -f "$script_path" ]]; then
    echo "Missing upgrade script: $script_path" >&2
    exit 1
  fi

  echo "Applying $script_name"
  mysql_exec < "$script_path"
done

cd "$COMPOSE_DIR"

echo "Rebuilding API, Admin, and Web containers for enterprise-isolation-v1"
docker compose -f "$COMPOSE_FILE" up -d --build api admin web

echo "Container status"
docker compose -f "$COMPOSE_FILE" ps

echo "Recent logs"
docker compose -f "$COMPOSE_FILE" logs --since=5m api admin web