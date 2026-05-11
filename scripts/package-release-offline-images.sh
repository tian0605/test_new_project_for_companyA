#!/usr/bin/env bash

set -euo pipefail

release_tag="${1:-}"
registry_prefix="${2:-}"
output_directory="${3:-./offline-packages}"
emqx_image="${4:-emqx/emqx:latest}"
skip_pull="${SKIP_PULL:-0}"

if [[ -z "$release_tag" || -z "$registry_prefix" ]]; then
  echo "usage: $0 <release-tag> <registry-prefix> [output-directory] [emqx-image]" >&2
  echo "example: $0 v2026.05.08-prod.1 ghcr.io/tian0605/myems ./offline-packages emqx/emqx:latest" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker CLI not found" >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd "$script_dir/.." && pwd)"
registry_prefix="${registry_prefix%/}"
output_directory="$(mkdir -p "$output_directory" && cd "$output_directory" && pwd)"

image_names=(
  web
  admin
  api
  aggregation
  cleaning
  normalization
)

image_references=()
for image_name in "${image_names[@]}"; do
  image_references+=("${registry_prefix}/${image_name}:${release_tag}")
done

tar_file_name="myems-${release_tag}-offline-images.tar"
tar_file_path="${output_directory}/${tar_file_name}"
manifest_file_path="${output_directory}/myems-${release_tag}-offline-images.manifest.txt"
docker_images_env_path="${output_directory}/docker-images.env"

echo "[STEP] release tag: ${release_tag}"
echo "[STEP] registry prefix: ${registry_prefix}"
echo "[STEP] output directory: ${output_directory}"

if [[ "$skip_pull" != "1" ]]; then
  echo "[STEP] pulling release images"
  for image_reference in "${image_references[@]}"; do
    echo "  -> docker pull ${image_reference}"
    docker pull "${image_reference}"
  done
else
  echo "[STEP] skipping pull and validating local images only"
fi

echo "[STEP] validating local images"
for image_reference in "${image_references[@]}"; do
  docker image inspect "${image_reference}" >/dev/null
done

echo "[STEP] generating docker-images.env"
"${repo_root}/scripts/render-docker-images-env.sh" \
  "${release_tag}" \
  "${registry_prefix}" \
  "${emqx_image}" \
  "${docker_images_env_path}"

rm -f "${tar_file_path}" "${manifest_file_path}"

echo "[STEP] exporting images to tar archive"
docker save -o "${tar_file_path}" "${image_references[@]}"

cat > "${manifest_file_path}" <<EOF
release_tag=${release_tag}
registry_prefix=${registry_prefix}
output_directory=${output_directory}
tar_file=$(basename "${tar_file_path}")
docker_images_env=$(basename "${docker_images_env_path}")
emqx_image=${emqx_image}
images=
$(printf '  %s\n' "${image_references[@]}")

production_load_command=
  docker load -i $(basename "${tar_file_path}")

production_compose_command=
  docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build web admin api cleaning normalization aggregation
EOF

tar_size_bytes="$(wc -c < "${tar_file_path}")"
echo "[OK] offline image tar created: ${tar_file_path}"
echo "[OK] package manifest created: ${manifest_file_path}"
echo "[OK] docker-images.env created: ${docker_images_env_path}"
echo "[OK] archive size bytes: ${tar_size_bytes}"
echo
echo "Next steps:"
echo "1. Copy ${tar_file_name} and docker-images.env to the production server."
echo "2. On the production server run: docker load -i ${tar_file_name}"
echo "3. Copy docker-images.env to /home/ubuntu/myems-complete/others/docker-images.env"
echo "4. Run docker compose --env-file docker-images.env -f docker-compose-on-linux.image.yml up -d --no-build web admin api cleaning normalization aggregation"