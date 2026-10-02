# Deploying to the VPS (ADR-036)

Production runs on one Ubuntu VPS as three Docker containers (`deploy/docker-compose.yml`):

- **app**: the Next.js standalone server (image built from `Dockerfile`).
- **caddy**: HTTPS and reverse proxy. Certificates are issued and renewed automatically.
- **cron**: calls the scheduled-reports job once an hour.

GitHub Actions does the deploying. After the Check job and every E2E shard pass, the `deploy` job:

1. builds the image and pushes it to GitHub's container registry (`ghcr.io`, private);
2. copies the compose file and Caddyfile to `~/modern-lms` on the VPS and writes `~/modern-lms/.env`;
3. runs `docker compose pull && docker compose up -d`;
4. checks that the site answers.

The deploy runs on every push to `main`. To deploy any other branch, open Actions → CI → **Run workflow** and pick the branch.

## Hostnames without a domain

If you don't set your own hostnames, the app gets free names from [sslip.io](https://sslip.io). These resolve to the IP address inside the name, and Caddy gets real Let's Encrypt certificates for them. For a VPS at `203.0.113.10`:

- app: `https://203-0-113-10.sslip.io`
- SCORM content: `https://content-203-0-113-10.sslip.io`

The second hostname is the separate content origin that multi-frame SCORM packages need (ADR-029).

When you have a domain, point two DNS **A records** at the VPS (for example `lms.example.com` and `content.example.com`). Then set the repository **variables** `PROD_APP_HOST` and `PROD_CONTENT_HOST` and re-run the deploy.

## One-time setup

### 1. Create a deploy key (on your computer)

```bash
ssh-keygen -t ed25519 -C github-actions-deploy -f modern-lms-deploy -N ""
```

This creates `modern-lms-deploy` (private) and `modern-lms-deploy.pub` (public).

### 2. Prepare the VPS (as root)

Copy `deploy/setup-vps.sh` to the server and run it with the **public** key:

```bash
sudo bash setup-vps.sh "$(cat modern-lms-deploy.pub)"
```

The script:

- installs Docker;
- opens ports 22, 80 and 443 in `ufw`;
- creates a `deploy` user in the `docker` group that logs in with that key.

If your provider also has a cloud firewall, open 80 and 443 there too.

### 3. Add the repository secrets

In GitHub, open the repo → Settings → Secrets and variables → Actions → **New repository secret**.

| Secret | Value |
|---|---|
| `VPS_HOST` | The VPS public IPv4 address |
| `VPS_USER` | `deploy` |
| `VPS_SSH_KEY` | The whole **private** key file `modern-lms-deploy` |
| `PROD_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `PROD_SUPABASE_ANON_KEY` | The same page, the `anon` `public` key |
| `PROD_SUPABASE_SERVICE_ROLE_KEY` | The same page, the `service_role` key (full DB access: secret only) |
| `PROD_RESEND_API_KEY` | Optional. Resend key for announcement emails. |
| `PROD_CRON_SECRET` | Optional. Any long random string; enables scheduled reports. |
| `VPS_KNOWN_HOSTS` | Optional. Output of `ssh-keyscan -H <ip>`; pins the server's host key. |

Optional repository **variables** (the Variables tab):

- `PROD_APP_HOST` and `PROD_CONTENT_HOST`: your own hostnames.
- `PROD_RESEND_FROM_EMAIL`: the sender address for emails.
- `VPS_SSH_PORT`: the SSH port, if it isn't 22.

### 4. Allow the new address in Supabase Auth

In Supabase, open Authentication → URL Configuration:

- set **Site URL** to `https://<app host>`;
- add `https://<app host>/**` to **Redirect URLs**.

Without this, email links and Google sign-in redirect to the wrong place.

### 5. Deploy

Push to `main`, or open Actions → CI → Run workflow. The job prints the URL it deployed to.

## Operating

On the VPS, as `deploy`, run these from `~/modern-lms`:

| Task | Command |
|---|---|
| Show the app's logs | `docker compose logs -f app` |
| Restart the app | `docker compose restart app` |
| Show container status | `docker compose ps` |
| Roll back | Set `APP_IMAGE` in `.env` to an older `ghcr.io/...:<commit sha>`, then `docker compose up -d` |

`.env` is rewritten on every deploy. Change secrets in GitHub, not on the server.
