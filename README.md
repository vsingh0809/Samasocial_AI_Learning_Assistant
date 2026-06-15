# Samasocial AI Learning Assistant

A production-grade multi-source RAG (Retrieval-Augmented Generation) chatbot that answers questions grounded strictly in user-provided content — PDFs, PowerPoint slides, YouTube videos, and web pages.

**Live API:** `https://rag-api.mangoground-e3b04a20.southindia.azurecontainerapps.io`  
**API Docs:** `https://rag-api.mangoground-e3b04a20.southindia.azurecontainerapps.io/docs`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Render)                     │
│                    React + Vite + TypeScript                 │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTPS
┌─────────────────────────▼───────────────────────────────────┐
│               Backend API (Azure Container Apps)             │
│                     FastAPI + Python 3.11                    │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────┐  │
│  │  Ingest  │  │  Clean   │  │  Chunk   │  │  Retrieve │  │
│  │ PDF/PPTX │  │  Text    │  │ + Embed  │  │ + Answer  │  │
│  │ URL/YT   │  │          │  │          │  │           │  │
│  └──────────┘  └──────────┘  └──────────┘  └───────────┘  │
└──────┬──────────────────────────────────┬───────────────────┘
       │                                  │
┌──────▼──────┐                  ┌────────▼────────┐
│ Qdrant Cloud│                  │  Azure OpenAI   │
│ Vector Store│                  │  Embeddings +   │
│  (Free Tier)│                  │  GPT Chat       │
└─────────────┘                  └─────────────────┘
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Backend | FastAPI + Python 3.11 | Async, fast, auto Swagger docs |
| LLM | Azure OpenAI (GPT) | Production-grade, grounded answers |
| Embeddings | Azure OpenAI (text-embedding-ada-002) | 1536-dim vectors, reliable |
| Vector DB | Qdrant Cloud (Free) | Managed, scalable, metadata filtering |
| Framework | LangChain 0.3.x | Chains, retrievers, prompt management |
| Container | Docker + Azure Container Registry | Reproducible deployments |
| Deployment | Azure Container Apps (Free Tier) | Serverless, scales to zero |
| Secrets | Azure Key Vault | Encrypted, audited, no plaintext secrets |
| CI/CD | GitHub Actions + OIDC | Zero-secret pipeline, auto deploy on push |
| Package Manager | uv | 10x faster than pip, reproducible lockfile |
| Frontend | React 19 + Vite + TypeScript | Modern, type-safe, fast HMR |
| Frontend Host | Render (Static Site) | Free, CDN-backed |

---

## Project Structure

```
rag_project/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD pipeline
├── api/
│   └── main.py                 # FastAPI app, all endpoints
├── clients/
│   ├── embeddings.py           # Azure OpenAI embeddings client
│   └── llm.py                  # Azure OpenAI chat client
├── ingestion/
│   ├── ingest.py               # Orchestrates all loaders
│   ├── cleaner.py              # PDF noise removal
│   └── loaders/
│       ├── pdf_loader.py       # PDF → LangChain Documents
│       ├── pptx_loader.py      # PPTX slides → Documents
│       ├── youtube_loader.py   # YouTube transcript → Documents
│       └── url_loader.py       # Webpage scrape → Documents
├── retrieval/
│   └── retriever.py            # Vector search, session memory, streaming
├── utils/
│   └── retry.py                # Exponential backoff wrapper
├── models/                     # Pydantic request/response models
├── Dockerfile
├── pyproject.toml              # uv dependencies
├── uv.lock                     # Locked dependency versions
└── .env.example                # Environment variable template
```

---

## Supported Input Sources

| Source | How | Citation Format |
|--------|-----|----------------|
| PDF | PyPDF text extraction | "Page 3 of document.pdf" |
| PPTX | python-pptx slide parsing | "Slide 4/12 of deck.pptx" |
| YouTube | youtube-transcript-api | "at 03:22 in the video" |
| Webpage | requests + BeautifulSoup4 | "from 'Page Title' (url)" |

---

## API Endpoints

### Health
```
GET /health
→ {"status": "healthy", "clients_ready": true}
```

### Ingest File
```
POST /ingest/file?session_id={uuid}
Content-Type: multipart/form-data
Body: file (PDF or PPTX)

→ {"status": "success", "chunks": 42, "summary": "...", "session_id": "..."}
```

### Ingest URL
```
POST /ingest/url
{
  "url": "https://...",
  "source_type": "youtube" | "url",
  "session_id": "uuid"
}

→ {"status": "success", "chunks": 18, "summary": "...", "session_id": "..."}
```

### Query (Standard)
```
POST /query
{
  "question": "What is covered in slide 3?",
  "session_id": "uuid",
  "stream": false
}

→ {
    "answer": "Slide 3 covers... [Slide 3/10 of deck.pptx]",
    "sources": ["deck.pptx"],
    "citations": ["Slide 3/10 of deck.pptx"],
    "session_id": "uuid"
  }
```

### Query (Streaming)
```
POST /query
{"question": "...", "session_id": "uuid", "stream": true}

→ Server-Sent Events stream, token by token
  Final event: [SOURCES]{"sources": [...], "citations": [...]}
```

### Session Management
```
GET    /session/{id}/sources   # Sources loaded in this session
DELETE /session/{id}           # Clear conversation history
```

### Quiz Mode (Bonus)
```
POST /quiz
{"session_id": "uuid", "num_questions": 5}

→ {"questions": [{"question": "...", "options": [...], "correct": "A", "explanation": "..."}]}
```

---

## Local Development

### Prerequisites
- Python 3.11+
- [uv](https://docs.astral.sh/uv/) package manager
- Azure OpenAI resource with deployments
- Qdrant Cloud free cluster

### Setup

```bash
# Clone repo
git clone https://github.com/vsingh0809/teaching_rag_prod
cd teaching_rag_prod

# Install uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies
uv sync

# Copy env template
cp .env.example .env
# Fill in your values

# Run locally
uv run uvicorn api.main:app --reload --port 8000
```

### `.env.example`

```env
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_API_VERSION=2024-02-01
AZURE_EMBEDDING_DEPLOYMENT=text-embedding-ada-002
AZURE_CHAT_DEPLOYMENT=your-chat-deployment

QDRANT_URL=https://your-cluster.qdrant.io
QDRANT_API_KEY=your-qdrant-key
QDRANT_COLLECTION=my_docs_Azure

FRONTEND_ORIGINS=http://localhost:5173
```

---

## Deployment

### Backend (Azure Container Apps)

CI/CD is fully automated via GitHub Actions. Every push to `main`:

1. Builds Docker image
2. Pushes to Azure Container Registry (`ragragistry`)
3. Deploys to Azure Container Apps (`rag-api`)
4. Health check verifies live endpoint

**Required GitHub Secrets:**
```
AZURE_CLIENT_ID       # Service principal for OIDC
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
ACR_USERNAME          # Container registry credentials
ACR_PASSWORD
```

**Secrets managed via Azure Key Vault** (`notbook-rag-llm`) — never stored in plaintext.

### Frontend (Render)

1. Connect GitHub repo to Render
2. New → Static Site
3. Build Command: `npm ci && npm run build`
4. Publish Directory: `dist`
5. Add env var: `VITE_API_BASE_URL=https://rag-api.mangoground-e3b04a20.southindia.azurecontainerapps.io`

---

## Key Design Decisions

### Session Isolation
Every user gets a UUID session. Chunks are tagged with `session_id` in Qdrant metadata. Queries filter by session — no cross-user data leakage.

### Chunking Strategy
- PDF/PPTX: 500 chars, 50 overlap — preserves sentence context
- URL: 300 chars, 30 overlap — web content is noisier, smaller chunks improve precision
- YouTube: 60-second segments — timestamp-aligned for accurate citations

### Batched Uploads
Qdrant free tier has write timeouts on large payloads. Uploads are batched at 20 chunks — prevents timeout on 100+ chunk documents.

### Streaming Architecture
Uses Server-Sent Events (SSE) via `sse-starlette`. LLM tokens stream via `llm.astream()`. Sources metadata appended as final SSE event after stream completes.

---

## Production Hardening Applied

- Environment validation at startup — fails fast with clear error
- Retry with exponential backoff on all external API calls
- Non-root Docker user
- Scale-to-zero on Azure (min replicas: 0) — zero cost when idle
- Budget alerts configured on Azure subscription
- Qdrant payload index on `session_id` — filtered queries without full scan
- CORS restricted to known frontend origins
- No secrets in code, Docker image, or GitHub — all via Key Vault

---

## Known Difficulties & How They Were Solved

### 1. Azure OpenAI Endpoint Format
**Problem:** Azure OpenAI SDK requires trailing slash on endpoint URL. Missing slash returns 401 even with correct API key. Error message says "invalid key" — completely misleading.

**Solution:** Always set `AZURE_OPENAI_ENDPOINT=https://resource.openai.azure.com/` with trailing slash. Added to env validation.

### 2. Qdrant Free Tier Write Timeouts
**Problem:** Uploading 100+ chunks in a single request times out on Qdrant's free tier. The `QdrantVectorStore.from_documents()` call sends all vectors in one batch.

**Solution:** Split into batches of 20 chunks with retry wrapper. Reduced URL chunk size to 300 chars to keep batch counts manageable.

### 3. Module-Level `os.getenv()` Reads
**Problem:** Environment variables read at module import time resolve to `None` because `load_dotenv()` hasn't run yet. Results in silent `None` URLs — LangChain then connects to `localhost:6333` and fails with "connection refused".

**Solution:** Move all `os.getenv()` calls inside functions, not at module level.

### 4. Docker Image Size on Windows
**Problem:** `chown -R` as a separate RUN layer duplicates the entire filesystem in Docker's overlay storage — added 256MB phantom layer. `COPY --from=ghcr.io/astral-sh/uv` pulled the entire uv Docker image (58MB).

**Solution:** Use `COPY --chown=appuser` inline, install uv via installer script scoped to binary only, set `UV_NO_CACHE=1`.

### 5. Azure Container Apps Lost Secrets After Resource Group Recreation
**Problem:** Accidentally deleted resource group. Recreating Container App lost managed identity, Key Vault role assignments, and secret references. Env vars showed `value: ""` instead of `secretRef`.

**Solution:** Re-assign system managed identity, re-grant `Key Vault Secrets User` RBAC role, re-run `az containerapp secret set` and `--set-env-vars secretref:` mapping. Document this runbook.

### 6. GitHub Actions OIDC Token Failure
**Problem:** `ACTIONS_ID_TOKEN_REQUEST_URL` env var missing — GitHub not issuing OIDC token. Root cause: `permissions` block must exist at BOTH workflow level AND job level.

**Solution:** Add `permissions: id-token: write` at both levels. Also ensure federated credential `subject` matches exact repo name including case.

### 7. Qdrant Session Filter Requires Payload Index
**Problem:** Filtering by `metadata.session_id` returns `400 Bad Request: Index required`. Qdrant requires explicit payload index before filtered queries work.

**Solution:** Create index at startup via `client.create_payload_index()` with `PayloadSchemaType.KEYWORD`. Safe to call multiple times — Qdrant ignores if already exists.

### 8. YouTube Transcript Blocking
**Problem:** `yt-dlp` blocked by YouTube bot detection. `youtube-transcript-api` returns `IpBlocked` on cloud deployments. Third-party transcript APIs (TubeText) return 500 for most videos.

**Solution:** Use `youtube-transcript-api` with multiple language fallbacks. Implement graceful fallback to video metadata when transcript unavailable. Accept this as a platform limitation — document clearly.

### 9. Azure Free Tier Region Constraints (India)
**Problem:** Azure free tier in South India has lower TPM (tokens per minute) limits on Azure OpenAI. Concurrent embedding requests during large PDF ingestion hit rate limits.

**Solution:** Batch embeddings with retry + exponential backoff. Reduce concurrent requests. Accept slightly slower ingestion as tradeoff for zero cost.

### 10. `faiss-cpu` Bloating Docker Image
**Problem:** `faiss-cpu` pulled in as transitive dependency added ~100MB to image and required C compiler (`gcc`) to build from source on `python:3.11-slim` — causing build failures.

**Solution:** Explicitly remove `faiss-cpu` from dependencies. Qdrant handles all vector operations — faiss is redundant when using a vector database.

---

## Assignment Coverage

| Requirement | Status | Implementation |
|-------------|--------|---------------|
| PDF ingestion | ✅ | PyPDF + LangChain |
| PPTX ingestion | ✅ | python-pptx |
| YouTube URL | ✅ | youtube-transcript-api |
| Webpage URL | ✅ | requests + BeautifulSoup4 |
| Vector retrieval | ✅ | Qdrant + LangChain |
| Streaming responses | ✅ | SSE via sse-starlette |
| Session memory | ✅ | In-memory with session_id |
| Source citations | ✅ | Metadata per chunk |
| Multi-source mixing | ✅ | session_id isolation |
| Graceful out-of-scope | ✅ | Prompt instruction |
| Basic UI | ✅ | React + Vite |
| Source badges | ✅ | `/session/{id}/sources` |
| Summary per source | ✅ | Extractive at ingest time |
| Quiz mode | ✅ | `/quiz` endpoint |

---

## License

MIT
