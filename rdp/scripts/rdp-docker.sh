#!/usr/bin/env bash
set -euo pipefail

# rdp-docker.sh — Install Windows RDP via Docker (dockur/windows)
# Reads 5 lines from stdin:
#   1: Windows version ID (e.g. 11, 10, 10l, 2022, 2019)
#   2: RAM size (e.g. 4G)
#   3: CPU cores (e.g. 2)
#   4: Disk size (e.g. 50G)
#   5: Password

read -r WIN_VERSION
read -r RAM_SIZE
read -r CPU_CORES
read -r DISK_SIZE
read -r PASSWORD

if [[ -z "$WIN_VERSION" || -z "$RAM_SIZE" || -z "$CPU_CORES" || -z "$DISK_SIZE" || -z "$PASSWORD" ]]; then
  echo "ERROR: All 5 input lines required (version, ram, cpu, disk, password)" >&2
  exit 1
fi

# Check KVM support
if [ ! -e /dev/kvm ]; then
  echo "ERROR: /dev/kvm not found. KVM support is required." >&2
  exit 1
fi

# Install Docker if not present
if ! command -v docker &>/dev/null; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo "Docker installed."
fi

CONTAINER_NAME="windows-rdp"
STORAGE_DIR="/opt/windows-rdp"
mkdir -p "$STORAGE_DIR"

echo "=== Docker RDP Installer ==="
echo "Version:   $WIN_VERSION"
echo "RAM:       $RAM_SIZE"
echo "CPU:       $CPU_CORES"
echo "Disk:      $DISK_SIZE"
echo "RDP Port:  3389"
echo "============================"

# Stop existing container if running
if docker ps -aq --filter "name=${CONTAINER_NAME}" | grep -q .; then
  echo "Removing existing container..."
  docker stop "${CONTAINER_NAME}" 2>/dev/null || true
  docker rm "${CONTAINER_NAME}" 2>/dev/null || true
  sleep 2
fi

# Run dockur/windows container
# Ref: https://github.com/dockur/windows
docker run -d \
  --name "${CONTAINER_NAME}" \
  -e "VERSION=${WIN_VERSION}" \
  -e "RAM_SIZE=${RAM_SIZE}" \
  -e "CPU_CORES=${CPU_CORES}" \
  -e "DISK_SIZE=${DISK_SIZE}" \
  -e "USERNAME=Docker" \
  -e "PASSWORD=${PASSWORD}" \
  -p 8006:8006 \
  -p 3389:3389/tcp \
  -p 3389:3389/udp \
  --device=/dev/kvm \
  --device=/dev/net/tun \
  --cap-add NET_ADMIN \
  --stop-timeout 120 \
  --restart unless-stopped \
  -v "${STORAGE_DIR}:/storage" \
  docker.io/dockurr/windows

echo ""
echo "Container started. Windows is installing..."
echo "RDP: $(hostname -I | awk '{print $1}'):3389"
echo "User: Docker"
echo "Web viewer: http://$(hostname -I | awk '{print $1}'):8006"
echo "Done."
