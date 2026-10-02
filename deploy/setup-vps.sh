#!/usr/bin/env bash
# One-time VPS preparation for Ubuntu 22.04/24.04 (ADR-036, docs/DEPLOY.md). Run as root:
#   curl -fsSL https://raw.githubusercontent.com/<owner>/modern-lms/<branch>/deploy/setup-vps.sh | bash -s -- "<public key>"
# or copy the file over and run: sudo bash setup-vps.sh "<public key>"
# Installs Docker, opens SSH/HTTP/HTTPS in the firewall, and creates a `deploy` user (member of the
# docker group) that GitHub Actions logs in as with the given SSH public key.
set -euo pipefail

PUBKEY="${1:-}"
if [ -z "$PUBKEY" ]; then
  echo "usage: setup-vps.sh \"ssh-ed25519 AAAA... github-actions-deploy\"" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH
  ufw allow 80/tcp
  ufw allow 443/tcp
  ufw allow 443/udp
  ufw --force enable
fi

if ! id deploy >/dev/null 2>&1; then
  adduser --disabled-password --gecos "" deploy
fi
usermod -aG docker deploy
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
touch /home/deploy/.ssh/authorized_keys
grep -qxF "$PUBKEY" /home/deploy/.ssh/authorized_keys || echo "$PUBKEY" >> /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
install -d -m 700 -o deploy -g deploy /home/deploy/modern-lms

echo "VPS ready. Add the matching private key to GitHub as VPS_SSH_KEY, VPS_USER=deploy."
