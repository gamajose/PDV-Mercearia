#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="gamajose/PDV-Mercearia"
INSTALL_DIR="/opt/pdv-gama-web"
DATA_DIR="/var/lib/pdv-gama"
SERVICE_FILE="/etc/systemd/system/pdv-gama-web.service"
PORT="${PDV_PORT:-5080}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Execute como root: sudo bash deploy/install-web.sh"
  exit 1
fi

command -v curl >/dev/null || { echo "curl é obrigatório."; exit 1; }
command -v tar >/dev/null || { echo "tar é obrigatório."; exit 1; }

VERSION="${PDV_VERSION:-$(curl -fsSL "https://api.github.com/repos/${REPOSITORY}/releases/latest" | sed -n 's/.*"tag_name": "v\([^"]*\)".*/\1/p' | head -1)}"
if [[ -z "${VERSION}" ]]; then
  echo "Não foi possível identificar a versão publicada."
  exit 1
fi

ASSET="pdv-gama-web-${VERSION}-linux-x64.tar.gz"
URL="https://github.com/${REPOSITORY}/releases/download/v${VERSION}/${ASSET}"
TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

curl -fL "${URL}" -o "${TMP}/${ASSET}"
mkdir -p "${INSTALL_DIR}" "${DATA_DIR}"
systemctl stop pdv-gama-web 2>/dev/null || true
rm -rf "${INSTALL_DIR:?}"/*
tar -xzf "${TMP}/${ASSET}" -C "${INSTALL_DIR}"
chmod +x "${INSTALL_DIR}/Pdv.Web"

cat > "${SERVICE_FILE}" <<SERVICE
[Unit]
Description=PDV Gama Web
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/Pdv.Web
Environment=ASPNETCORE_URLS=http://0.0.0.0:${PORT}
Environment=PDV_DATA_DIR=${DATA_DIR}
Restart=always
RestartSec=5
User=root

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable --now pdv-gama-web

echo "PDV Gama Web instalado."
echo "Acesse: http://IP_DA_VM:${PORT}"
echo "Status: systemctl status pdv-gama-web"
