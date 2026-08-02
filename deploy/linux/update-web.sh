#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY="gamajose/PDV-Mercearia"
API_URL="https://api.github.com/repos/${REPOSITORY}/releases/latest"
INSTALL_ROOT="/opt/pdv-gama"
SERVICE_NAME="pdv-gama-web"

log() { printf '[PDV Gama Update] %s\n' "$*"; }
fail() { printf '[PDV Gama Update] ERRO: %s\n' "$*" >&2; exit 1; }

[[ "${EUID}" -eq 0 ]] || fail "a atualização precisa ser executada como root"
for command in curl python3 tar sha256sum systemctl; do
  command -v "${command}" >/dev/null 2>&1 || fail "comando obrigatório não encontrado: ${command}"
done

current="$(cat "${INSTALL_ROOT}/VERSION" 2>/dev/null || printf '0.0.0')"
workdir="$(mktemp -d)"
trap 'rm -rf "${workdir}"' EXIT

curl -fsSL -H 'Accept: application/vnd.github+json' "${API_URL}" -o "${workdir}/release.json"
mapfile -t release < <(python3 - "${workdir}/release.json" <<'PY'
import json, re, sys
with open(sys.argv[1], encoding='utf-8') as stream:
    data = json.load(stream)
version = data.get('tag_name', '').lstrip('vV')
archive_name = f'PDV-Gama-Web-{version}-linux-x64.tar.gz'
checksum_name = archive_name + '.sha256'
assets = {asset.get('name'): asset.get('browser_download_url') for asset in data.get('assets', [])}
print(version)
print(assets.get(archive_name, ''))
print(assets.get(checksum_name, ''))
PY
)

latest="${release[0]:-}"
archive_url="${release[1]:-}"
checksum_url="${release[2]:-}"
[[ -n "${latest}" && -n "${archive_url}" && -n "${checksum_url}" ]] || fail "Release sem pacote web Linux"

if python3 - "${current}" "${latest}" <<'PY'
import sys
from itertools import zip_longest
def version(value): return tuple(int(part) for part in value.split('.')[:3])
sys.exit(0 if version(sys.argv[2]) > version(sys.argv[1]) else 1)
PY
then
  log "nova versão encontrada: ${current} -> ${latest}"
else
  log "versão ${current} já está atualizada"
  exit 0
fi

archive="${workdir}/pdv-gama-web.tar.gz"
checksum="${workdir}/pdv-gama-web.tar.gz.sha256"
curl -fL "${archive_url}" -o "${archive}"
curl -fL "${checksum_url}" -o "${checksum}"
expected="$(awk '{print $1}' "${checksum}")"
actual="$(sha256sum "${archive}" | awk '{print $1}')"
[[ "${expected}" == "${actual}" ]] || fail "o SHA-256 do pacote não confere"

release_dir="${INSTALL_ROOT}/releases/${latest}"
rm -rf "${release_dir}"
mkdir -p "${release_dir}"
tar -xzf "${archive}" -C "${release_dir}"
chmod +x "${release_dir}/Pdv.Web" "${release_dir}/tools/update-web.sh"

systemctl stop "${SERVICE_NAME}.service"
ln -sfn "${release_dir}" "${INSTALL_ROOT}/current"
printf '%s\n' "${latest}" > "${INSTALL_ROOT}/VERSION"
install -m 0755 "${release_dir}/tools/update-web.sh" /usr/local/sbin/pdv-gama-update
systemctl start "${SERVICE_NAME}.service"

find "${INSTALL_ROOT}/releases" -mindepth 1 -maxdepth 1 -type d ! -path "${release_dir}" -mtime +14 -exec rm -rf {} +
log "atualização ${latest} aplicada com sucesso"
