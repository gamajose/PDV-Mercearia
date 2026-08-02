#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY="gamajose/PDV-Mercearia"
API_URL="https://api.github.com/repos/${REPOSITORY}/releases/latest"
INSTALL_ROOT="/opt/pdv-gama"
DATA_ROOT="/var/lib/pdv-gama"
CONFIG_ROOT="/etc/pdv-gama"
SERVICE_NAME="pdv-gama-web"
PORT="${PDV_PORT:-5080}"

log() { printf '[PDV Gama] %s\n' "$*"; }
fail() { printf '[PDV Gama] ERRO: %s\n' "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || fail "execute como root: sudo bash install-web.sh"
for command in curl python3 tar sha256sum systemctl; do
  command -v "${command}" >/dev/null 2>&1 || fail "comando obrigatório não encontrado: ${command}"
done

workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT

log "consultando a versão mais recente..."
curl -fsSL -H 'Accept: application/vnd.github+json' "${API_URL}" -o "${workdir}/release.json"
mapfile -t release < <(python3 - "${workdir}/release.json" <<'PY'
import json, re, sys
with open(sys.argv[1], encoding='utf-8') as stream:
    data = json.load(stream)
tag = data.get('tag_name', '')
version = tag.lstrip('vV')
archive_pattern = re.compile(rf'^PDV-Gama-Web-{re.escape(version)}-linux-x64\.tar\.gz$')
checksum_pattern = re.compile(rf'^PDV-Gama-Web-{re.escape(version)}-linux-x64\.tar\.gz\.sha256$')
archive = checksum = ''
for asset in data.get('assets', []):
    name = asset.get('name', '')
    if archive_pattern.match(name): archive = asset.get('browser_download_url', '')
    if checksum_pattern.match(name): checksum = asset.get('browser_download_url', '')
print(version)
print(archive)
print(checksum)
PY
)

version="${release[0]:-}"
archive_url="${release[1]:-}"
checksum_url="${release[2]:-}"
[[ -n "${version}" && -n "${archive_url}" && -n "${checksum_url}" ]] || fail "a Release mais recente não contém o pacote web Linux"

archive="${workdir}/pdv-gama-web.tar.gz"
checksum="${workdir}/pdv-gama-web.tar.gz.sha256"
log "baixando PDV Gama Web ${version}..."
curl -fL "${archive_url}" -o "${archive}"
curl -fL "${checksum_url}" -o "${checksum}"
(
  cd "${workdir}"
  expected="$(awk '{print $1}' "${checksum}")"
  actual="$(sha256sum "${archive}" | awk '{print $1}')"
  [[ "${expected}" == "${actual}" ]] || fail "o SHA-256 do pacote não confere"
)

if ! id -u pdvgama >/dev/null 2>&1; then
  useradd --system --home-dir "${DATA_ROOT}" --shell /usr/sbin/nologin pdvgama
fi

mkdir -p "${INSTALL_ROOT}/releases/${version}" "${DATA_ROOT}" "${CONFIG_ROOT}"
chown -R pdvgama:pdvgama "${DATA_ROOT}"
tar -xzf "${archive}" -C "${INSTALL_ROOT}/releases/${version}"
chmod +x "${INSTALL_ROOT}/releases/${version}/Pdv.Web"
ln -sfn "${INSTALL_ROOT}/releases/${version}" "${INSTALL_ROOT}/current"
printf '%s\n' "${version}" > "${INSTALL_ROOT}/VERSION"

cat > "${CONFIG_ROOT}/pdv-gama.env" <<EOF
PDV_DATA_DIR=${DATA_ROOT}
PDV_URLS=http://0.0.0.0:${PORT}
ASPNETCORE_ENVIRONMENT=Production
EOF
chmod 640 "${CONFIG_ROOT}/pdv-gama.env"

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=PDV Gama Web
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=pdvgama
Group=pdvgama
WorkingDirectory=${INSTALL_ROOT}/current
EnvironmentFile=-${CONFIG_ROOT}/pdv-gama.env
ExecStart=${INSTALL_ROOT}/current/Pdv.Web
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ReadWritePaths=${DATA_ROOT}

[Install]
WantedBy=multi-user.target
EOF

install -m 0755 "${INSTALL_ROOT}/current/tools/update-web.sh" /usr/local/sbin/pdv-gama-update
cat > "/etc/systemd/system/pdv-gama-update.service" <<EOF
[Unit]
Description=Atualização automática do PDV Gama Web
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/pdv-gama-update
EOF

cat > "/etc/systemd/system/pdv-gama-update.timer" <<'EOF'
[Unit]
Description=Verifica atualizações do PDV Gama Web

[Timer]
OnBootSec=10min
OnUnitActiveSec=6h
RandomizedDelaySec=10min
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable --now "${SERVICE_NAME}.service"
systemctl enable --now pdv-gama-update.timer

log "instalação concluída"
log "acesse: http://IP_DA_VM:${PORT}"
log "no primeiro acesso, cadastre a empresa, a filial e o administrador"
