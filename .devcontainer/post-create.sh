#!/usr/bin/env bash
# .devcontainer/post-create.sh
#
# Runs ONCE after the dev container is first created.
# Installs all project dependencies and sets up pre-commit hooks.
# Keep this idempotent — safe to re-run manually.

set -euo pipefail

echo "──────────────────────────────────────────────"
echo "  🚀  NAUTOS dev container setup"
echo "──────────────────────────────────────────────"

# ── 1. Python worker dependencies ─────────────────────────────────────────
echo "📦  Installing Python worker dependencies (uv sync)..."
cd /workspace/nautos-worker
uv sync --extra dev
echo "✅  Python deps installed"

# ── 2. Next.js app dependencies ────────────────────────────────────────────
echo "📦  Installing Next.js app dependencies (pnpm install)..."
cd /workspace/nautos-app
pnpm install
echo "✅  Node deps installed"

# ── 3. Playwright browser binaries ─────────────────────────────────────────
echo "🎭  Installing Playwright browsers (chromium + firefox)..."
cd /workspace/nautos-app
pnpm exec playwright install --with-deps chromium firefox
echo "✅  Playwright browsers installed"

# ── 4. Pre-commit hooks ────────────────────────────────────────────────────
echo "🔧  Installing pre-commit hooks..."
cd /workspace
pre-commit install --install-hooks
pre-commit install --hook-type commit-msg
echo "✅  Pre-commit hooks installed"

# ── 5. Generate fresh detect-secrets baseline ─────────────────────────────
echo "🔐  Refreshing .secrets.baseline..."
cd /workspace
detect-secrets scan \
  --exclude-files '\.env\.example$' \
  --exclude-files 'tests/.*' \
  --exclude-files 'pnpm-lock\.yaml' \
  --exclude-files 'uv\.lock' \
  > .secrets.baseline
echo "✅  .secrets.baseline updated"

echo ""
echo "──────────────────────────────────────────────"
echo "  ✅  Dev container ready!"
echo ""
echo "  Quick commands:"
echo "    make up          → start all Docker services"
echo "    ptest            → run Python tests"
echo "    atest            → run frontend unit tests"
echo "    e2e              → run Playwright E2E tests"
echo "    lint-py          → ruff + mypy"
echo "    lint-ts          → ESLint"
echo "    obs up           → start observability stack"
echo "──────────────────────────────────────────────"
