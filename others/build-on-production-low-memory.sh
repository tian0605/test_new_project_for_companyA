#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="$ROOT_DIR/others"
COMPOSE_FILE="$COMPOSE_DIR/docker-compose-on-linux.yml"

TARGET_SERVICES=("${@}")
if [[ ${#TARGET_SERVICES[@]} -eq 0 ]]; then
  TARGET_SERVICES=(api admin web)
fi

RELIEF_SERVICES=(aggregation cleaning normalization)
NO_TOUCH_SERVICES=(modbus_tcp emqx myems_mqtt)

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

contains_service() {
  local expected="$1"
  shift
  local item
  for item in "$@"; do
    if [[ "$item" == "$expected" ]]; then
      return 0
    fi
  done
  return 1
}

validate_targets() {
  local target
  for target in "${TARGET_SERVICES[@]}"; do
    if contains_service "$target" "${NO_TOUCH_SERVICES[@]}"; then
      echo "Refusing to build protected service on low-memory production: $target" >&2
      echo "Protected services: ${NO_TOUCH_SERVICES[*]}" >&2
      exit 1
    fi
  done
}

http_check() {
  local service="$1"
  case "$service" in
    web)
      curl -I --max-time 15 http://127.0.0.1/
      ;;
    admin)
      curl -I --max-time 15 http://127.0.0.1:8001/
      ;;
    api)
      curl -i --max-time 15 http://127.0.0.1:8000/version | sed -n '1,20p'
      ;;
    *)
      compose ps "$service"
      ;;
  esac
}

restart_relief_services() {
  echo "Restarting memory-relief services: ${RELIEF_SERVICES[*]}"
  compose up -d --no-deps "${RELIEF_SERVICES[@]}"
  compose ps "${RELIEF_SERVICES[@]}"
}

cd "$COMPOSE_DIR"

validate_targets

echo "Low-memory production build mode"
echo "Target services: ${TARGET_SERVICES[*]}"
echo "Memory-relief services to stop first: ${RELIEF_SERVICES[*]}"
echo "Protected services left untouched: ${NO_TOUCH_SERVICES[*]}"

echo "Stopping memory-relief services"
compose stop "${RELIEF_SERVICES[@]}"
compose ps "${RELIEF_SERVICES[@]}"

for service in "${TARGET_SERVICES[@]}"; do
  echo
  echo "Stopping target service before rebuild: $service"
  compose stop "$service"
  compose ps "$service"

  echo "Building and starting: $service"
  compose up -d --build --no-deps "$service"
  compose ps "$service"

  echo "Recent logs: $service"
  compose logs --since=5m "$service"

  echo "HTTP/status check: $service"
  http_check "$service"
done

restart_relief_services

echo
echo "Final container status"
compose ps