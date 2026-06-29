# .devcontainer/Dockerfile
#
# Unified development container for the nautos monorepo.
# Provides: Node.js 22, pnpm, Python 3.12 + uv, Docker-in-Docker,
# Playwright browser dependencies, and common CLI tools.
#
# Base image: Microsoft's Ubuntu 24.04 dev container base (includes git,
# zsh, common-utils, and VS Code server prerequisites).

FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

ARG NODE_VERSION="22"
ARG PYTHON_VERSION="3.12"
ARG UV_VERSION="0.6.14"

# Avoid interactive prompts during apt operations
ENV DEBIAN_FRONTEND=noninteractive \
    # Ensure uv and uv-installed tools are on PATH
    PATH="/root/.local/bin:/root/.cargo/bin:${PATH}" \
    # pnpm global store
    PNPM_HOME="/root/.local/share/pnpm" \
    # Python: don't write .pyc, show logs immediately
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# ── System packages ─────────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Core tooling
    curl \
    wget \
    git \
    make \
    jq \
    unzip \
    ca-certificates \
    gnupg \
    lsb-release \
    # Python build deps
    libssl-dev \
    libffi-dev \
    libbz2-dev \
    libreadline-dev \
    libsqlite3-dev \
    # Playwright system dependencies (Chromium / Firefox)
    libnss3 \
    libatk-bridge2.0-0 \
    libcups2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2t64 \
    libatspi2.0-0 \
    # PostgreSQL client (for psql debugging)
    postgresql-client \
    && rm -rf /var/lib/apt/lists/*

# ── Node.js 22 (via NodeSource) ─────────────────────────────────────────────
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/* \
    # Enable corepack for pnpm
    && corepack enable \
    && corepack prepare pnpm@latest --activate

# ── Python 3.12 + uv ────────────────────────────────────────────────────────
# Install uv (the fast Python package manager used by nautos-worker)
RUN curl -LsSf https://astral.sh/uv/${UV_VERSION}/install.sh | sh \
    # Install Python 3.12 via uv
    && uv python install ${PYTHON_VERSION} \
    # Install pre-commit and detect-secrets globally
    && uv tool install pre-commit \
    && uv tool install detect-secrets

# ── Docker CLI (for Docker-in-Docker, provided by devcontainer feature) ─────
# The actual DinD daemon is provided by the devcontainer feature in devcontainer.json.
# We only need the Docker CLI here.
RUN install -m 0755 -d /etc/apt/keyrings \
    && curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
       | gpg --dearmor -o /etc/apt/keyrings/docker.gpg \
    && chmod a+r /etc/apt/keyrings/docker.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
       https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
       | tee /etc/apt/sources.list.d/docker.list > /dev/null \
    && apt-get update \
    && apt-get install -y --no-install-recommends docker-ce-cli docker-compose-plugin \
    && rm -rf /var/lib/apt/lists/*

# ── Shell niceties ───────────────────────────────────────────────────────────
# Add useful aliases for both apps
RUN echo '\n\
# nautos aliases\n\
alias worker="cd /workspace/nautos-worker"\n\
alias app="cd /workspace/nautos-app"\n\
alias ptest="cd /workspace/nautos-worker && uv run pytest -v"\n\
alias atest="cd /workspace/nautos-app && pnpm test"\n\
alias e2e="cd /workspace/nautos-app && pnpm test:e2e"\n\
alias lint-py="cd /workspace/nautos-worker && uv run ruff check . && uv run mypy app/"\n\
alias lint-ts="cd /workspace/nautos-app && pnpm lint"\n\
alias dc="docker compose"\n\
alias obs="docker compose -f docker-compose.yml -f docker-compose.observability.yml"\n\
' >> /root/.bashrc

WORKDIR /workspace
