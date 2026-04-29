#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="/mnt/d/VSCode/myems_development_enterprise-isolation-v2"
EMQX_DIR="$REPO_ROOT/others/emqx"
ASDF_DIR="${ASDF_DIR:-/root/.asdf}"
ERLANG_VSN="28.4.1"
ELIXIR_VSN="1.19.1-otp-28"
KERL_BASE_DIR="${KERL_BASE_DIR:-/root/.kerl}"

# Avoid inheriting the Windows worktree cwd while asdf/plugins invoke git.
cd /root
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX
export GIT_HTTP_VERSION=HTTP/1.1

if command -v git >/dev/null 2>&1; then
    git config --global http.version HTTP/1.1
fi

if command -v dpkg >/dev/null 2>&1; then
    missing_packages=()

    if ! dpkg -s libkrb5-dev >/dev/null 2>&1; then
        missing_packages+=(libkrb5-dev)
    fi

    if ! dpkg -s libsasl2-dev >/dev/null 2>&1; then
        missing_packages+=(libsasl2-dev)
    fi

    if ! dpkg -s libsnappy-dev >/dev/null 2>&1; then
        missing_packages+=(libsnappy-dev)
    fi

    if ! dpkg -s liblz4-dev >/dev/null 2>&1; then
        missing_packages+=(liblz4-dev)
    fi

    if ! command -v cmake >/dev/null 2>&1; then
        missing_packages+=(cmake)
    fi

    if ! command -v cargo >/dev/null 2>&1; then
        missing_packages+=(cargo)
    fi

    if ! command -v rustc >/dev/null 2>&1; then
        missing_packages+=(rustc)
    fi

    if [ "${#missing_packages[@]}" -gt 0 ]; then
        if command -v apt-get >/dev/null 2>&1 && [ "$(id -u)" -eq 0 ]; then
            export DEBIAN_FRONTEND=noninteractive
            apt-get install -y --no-install-recommends "${missing_packages[@]}"
        else
            echo "Missing system package(s): ${missing_packages[*]}" >&2
            exit 1
        fi
    fi
fi

if [ ! -d "$ASDF_DIR" ]; then
    git clone https://github.com/asdf-vm/asdf.git "$ASDF_DIR" --branch v0.18.0
fi

. "$ASDF_DIR/asdf.sh"

if ! asdf plugin list | grep -qx erlang; then
    asdf plugin add erlang https://github.com/asdf-vm/asdf-erlang.git
fi

if ! asdf plugin list | grep -qx elixir; then
    asdf plugin add elixir https://github.com/asdf-vm/asdf-elixir.git
fi

unset KERL_BUILD_DOCS
export MAKEFLAGS="${MAKEFLAGS:--j4}"
export KERL_BASE_DIR
export ERLANG_ROCKSDB_OPTS="${ERLANG_ROCKSDB_OPTS:--DWITH_LZ4=ON -DWITH_SNAPPY=ON}"

mkdir -p "$KERL_BASE_DIR"
printf '%s\n' "$ERLANG_VSN" > "$KERL_BASE_DIR/otp_releases"

ERLANG_INSTALL_DIR="$ASDF_DIR/installs/erlang/$ERLANG_VSN"
ELIXIR_INSTALL_DIR="$ASDF_DIR/installs/elixir/$ELIXIR_VSN"

if [ ! -x "$ERLANG_INSTALL_DIR/bin/erl" ]; then
    rm -rf "$ERLANG_INSTALL_DIR"
    asdf install erlang "$ERLANG_VSN"
fi

if [ ! -x "$ELIXIR_INSTALL_DIR/bin/elixir" ]; then
    rm -rf "$ELIXIR_INSTALL_DIR"
    asdf install elixir "$ELIXIR_VSN"
fi

asdf global erlang "$ERLANG_VSN"
asdf global elixir "$ELIXIR_VSN"
asdf shell erlang "$ERLANG_VSN"
asdf shell elixir "$ELIXIR_VSN"
asdf reshim erlang "$ERLANG_VSN"
asdf reshim elixir "$ELIXIR_VSN"

cd "$EMQX_DIR"
make