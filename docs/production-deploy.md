# Production deploy

`ci.yml` builds and pushes `backend`/`frontend` images to GHCR on every push
to `main`. `deploy.yml` runs after that, SSHes into production, and pulls
those images by their commit's `sha-<short-sha>` tag — no image is rebuilt
during deploy.

A `production` GitHub Environment already exists with a generated deploy
keypair; its private half is stored as the `SSH_PRIVATE_KEY` secret. The
matching public key (add this to the server, not GitHub):

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGKPNOSjzXbktaIz+4FSzRRcHsuXmS8+faGz6ybAGUkG docuwave-deploy
```

## One-time server setup

On the production host:

1. Install Docker Engine and the Docker Compose plugin.
2. Create a deploy user (or reuse an existing one) and add the public key
   above to its `~/.ssh/authorized_keys`.
3. Give that user access to the Docker socket (e.g. add it to the `docker`
   group) so it can run `docker compose` without `sudo`.
4. Pick a directory for the deploy (e.g. `/opt/docuwave`) and copy
   `docker-compose.registry.yml` from this repo into it.
5. In that same directory, create a `.env` with production values for the
   variables `docker-compose.registry.yml` references (`POSTGRES_USER`,
   `POSTGRES_PASSWORD`, `POSTGRES_DB`, `JWT_SECRET`,
   `DATASOURCE_ENCRYPTION_KEY`, `LLM_ENCRYPTION_KEY`, `GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URL`). Keep this file only on
   the server — it's never committed.
6. Run `docker compose -f docker-compose.registry.yml pull && docker compose -f docker-compose.registry.yml up -d`
   once by hand to confirm it comes up.

## GitHub configuration

Add these secrets to the `production` environment
(Settings → Environments → production):

| Secret | Value |
|---|---|
| `SSH_HOST` | server IP or hostname |
| `SSH_USER` | the deploy user created above |
| `DEPLOY_PATH` | the directory from step 4 (e.g. `/opt/docuwave`) |
| `SSH_PORT` | optional, only if not 22 |

`SSH_PRIVATE_KEY` is already set.

Once those are in place, every merge to `main` builds, publishes, and
deploys automatically.
