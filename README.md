# ByteDance LabelHub

Public source snapshot of the LabelHub monorepo.

This repository intentionally keeps only the core application code:

- `backend/app`: FastAPI routes, models, services, auth, AI audit flow, export flow
- `frontend/src`: React pages, renderer, API client, role workspaces, shared UI logic
- `aiagent`: background AI/executor modules and async job helpers

To keep the public repository clean and safe, this snapshot does not include:

- project docs and planning artifacts
- deployment scripts and infrastructure files
- `.env` files and local runtime configuration
- test suites, mock data, caches, and generated files

Sensitive defaults were replaced with placeholders before publishing:

- database host, username, password, and Redis URL
- JWT default secret
- demo account passwords

This is a source-only monorepo snapshot. It is intended for code review, architecture sharing, and portfolio/reference use rather than direct one-command startup.

If you want to run it locally, wire your own environment, dependency manifests, and deployment/configuration files around the source tree.
