FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_NO_CACHE=1 \
    PATH="/root/.local/bin:$PATH"

# WHY THIS APPROACH:
# Instead of curl installing uv (pulls 61MB of extras)
# We copy ONLY the uv binary from the official uv image
# That image has uv at /uv — we take just that file
# Result: ~10MB instead of 61MB
COPY --from=ghcr.io/astral-sh/uv:0.5.4 /uv /usr/local/bin/uv

RUN adduser --disabled-password --gecos "" appuser

WORKDIR /app

COPY pyproject.toml uv.lock ./

# WHY --no-install-project:
# Installs only dependencies, not your own package
# Faster and cleaner
RUN uv sync --frozen --no-dev --no-install-project && \
    find /root/.local -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

COPY --chown=appuser:appuser api/ ./api/
COPY --chown=appuser:appuser clients/ ./clients/
COPY --chown=appuser:appuser ingestion/ ./ingestion/
COPY --chown=appuser:appuser retrieval/ ./retrieval/
COPY --chown=appuser:appuser utils/ ./utils/
COPY --chown=appuser:appuser models/ ./models/

USER appuser

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]