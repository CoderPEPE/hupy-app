# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Builder: compile the release binary (Diesel's postgres driver needs libpq).
# ---------------------------------------------------------------------------
FROM rust:1-slim-bookworm AS builder

WORKDIR /app

# Install the C library Diesel's postgres backend links against, plus
# pkg-config so the build can find it.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev pkg-config \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Dependency-layer cache: copy manifests + a stub main, build once. Cargo
# recompiles nothing until the real sources land below, so changing src/
# reuses the compiled dependency layer instead of rebuilding everything.
# ---------------------------------------------------------------------------
COPY Cargo.toml Cargo.lock diesel.toml ./
RUN mkdir src && echo 'fn main() {}' > src/main.rs \
    && cargo build --release --locked

# The real sources — including migrations, which embed_migrations!() reads at
# compile time — then a final build that only recompiles the crate itself.
COPY migrations ./migrations
COPY src ./src
RUN touch src/main.rs && cargo build --release --locked

# ---------------------------------------------------------------------------
# Runtime: a slim image with only the shared libs the binary needs.
# ---------------------------------------------------------------------------
FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq5 ca-certificates curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 huppy

USER huppy
WORKDIR /home/huppy

COPY --from=builder --chown=huppy:huppy /app/target/release/huppy-backend /usr/local/bin/huppy-backend

EXPOSE 3000

# Migrations run automatically on boot (see src/main.rs).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://localhost:3000/health >/dev/null || exit 1

CMD ["huppy-backend"]
