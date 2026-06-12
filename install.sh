#!/usr/bin/env bash

set -euo pipefail

REPO="ghchinoy/agentskills"
BINARY_NAME="agentskills"

echo "Installing ${BINARY_NAME}..."

OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "${ARCH}" in
    x86_64) ARCH="amd64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *) echo "Unsupported architecture: ${ARCH}"; exit 1 ;;
esac

case "${OS}" in
    linux) OS="linux" ;;
    darwin) OS="darwin" ;;
    *) echo "Unsupported OS: ${OS}"; exit 1 ;;
esac

INSTALL_DIR="/usr/local/bin"
if [ ! -w "${INSTALL_DIR}" ]; then
    INSTALL_DIR="${HOME}/.local/bin"
fi
mkdir -p "${INSTALL_DIR}"

if [ "${INSTALL_DIR}" = "${HOME}/.local/bin" ]; then
    case :$PATH: in
        *:"${INSTALL_DIR}":*) ;;
        *) echo "Warning: ${INSTALL_DIR} is not in your PATH. Add it to utilize the global binary." ;;
    esac
fi

echo "Fetching latest release from GitHub..."
LATEST_RELEASE=$(curl -s "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"([^"]+)".*/\1/')

if [ -z "${LATEST_RELEASE}" ]; then
    LATEST_RELEASE="v1.0.0"
    echo "Could not resolve latest tag from GitHub API, falling back to ${LATEST_RELEASE}"
else
    echo "Resolved latest version: ${LATEST_RELEASE}"
fi

VERSION="${LATEST_RELEASE#v}"
FILENAME="${BINARY_NAME}_${VERSION}_${OS}_${ARCH}.tar.gz"
DOWNLOAD_URL="https://github.com/${REPO}/releases/download/${LATEST_RELEASE}/${FILENAME}"

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "${TEMP_DIR}"' EXIT

echo "Downloading from ${DOWNLOAD_URL}..."
if ! curl -fsSL "${DOWNLOAD_URL}" -o "${TEMP_DIR}/${FILENAME}"; then
    echo "Failed to download release archive. Check your connection or release tag."
    exit 1
fi

echo "Extracting archive..."
tar -xzf "${TEMP_DIR}/${FILENAME}" -C "${TEMP_DIR}"

echo "Installing binary to ${INSTALL_DIR}/${BINARY_NAME}..."
cp -f "${TEMP_DIR}/${BINARY_NAME}" "${INSTALL_DIR}/${BINARY_NAME}"
chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

SKILLS_SRC_DIR="${TEMP_DIR}/skills"
SKILLS_DEST_DIR="${HOME}/.config/agentskills/skills"

if [ -d "${SKILLS_SRC_DIR}" ]; then
    echo "Installing agent skills to ${SKILLS_DEST_DIR}..."
    mkdir -p "${SKILLS_DEST_DIR}"
    cp -rf "${SKILLS_SRC_DIR}/"* "${SKILLS_DEST_DIR}/"
fi

echo "Installation complete."
echo "Run '${BINARY_NAME} --help' to verify."
