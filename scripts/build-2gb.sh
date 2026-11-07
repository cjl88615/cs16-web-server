#!/bin/sh
# Serialized BuildKit build for a 2 vCPU / 2 GiB VM.
# The resulting image contains game assets; keep it local.
set -eu
cd "$(dirname "$0")/.."
if ! docker buildx version >/dev/null 2>&1; then
  echo "Docker Buildx is required" >&2
  exit 1
fi
builder="cs16-lowmem-$$"
temp_dir=$(mktemp -d)
cleanup() {
  docker buildx rm --force "$builder" >/dev/null 2>&1 || :
  rm -rf "$temp_dir"
}
trap cleanup 0
trap 'exit 130' 2
trap 'exit 143' 15
cat >"$temp_dir/buildkitd.toml" <<'EOF'
[worker.oci]
  max-parallelism = 1
EOF
docker buildx create --name "$builder" --driver docker-container \
  --buildkitd-config "$temp_dir/buildkitd.toml" >/dev/null
docker buildx build --builder "$builder" --platform linux/amd64 --load \
  --progress plain -t cs16-web-server:2026.11.07-r2 .
