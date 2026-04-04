# GitHub Actions CI/CD

This project includes a GitHub Actions pipeline that validates the app on every push and pull request, then automatically deploys the production stack when code is pushed to `main`.

## What the pipeline does

1. Runs backend tests against PostgreSQL 16.
2. Builds the React frontend to catch production build errors.
3. Validates all Docker images (`backend`, `frontend`, and `backup`).
4. On pushes to `main`, builds and pushes container images to DigitalOcean Container Registry.
5. Connects to the DigitalOcean Droplet over SSH and redeploys the Docker Swarm stack.
6. Verifies the deployment by calling `/api/health`.

## Required GitHub repository secrets

Add these under **Settings → Secrets and variables → Actions**:

- `DIGITALOCEAN_ACCESS_TOKEN`: DigitalOcean API token with registry access.
- `DOCR_USERNAME`: Container Registry username used by `docker login`.
- `DOCR_PASSWORD`: Container Registry password or token used by `docker login`.
- `DO_DROPLET_IP`: Public IP address of the production Droplet.
- `DO_DROPLET_ID`: Droplet ID used by the application for metrics.
- `DO_SSH_USER`: SSH username for the Droplet.
- `DO_SSH_PRIVATE_KEY`: Private SSH key for the deployment user.

## Production server expectations

The workflow assumes the Droplet already has:

- Docker Engine installed
- Swarm initialized
- the repository copied to `/opt/task-manager`
- required Docker Swarm secrets already created:
  - `db_password`
  - `jwt_secret`
  - `do_api_token`

## Trigger behavior

- **Pull requests to `main` or `develop`**: run CI checks only
- **Pushes to `develop`**: run CI checks only
- **Pushes to `main`**: run CI checks and deploy automatically

## Manual validation after setup

After adding the secrets and pushing to `main`:

1. Open the **Actions** tab in GitHub and confirm all jobs passed.
2. SSH into the Droplet and run `docker service ls`.
3. Open the deployed app and verify login plus `/api/health`.

