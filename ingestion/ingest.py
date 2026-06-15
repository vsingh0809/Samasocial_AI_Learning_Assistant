from langchain_community.document_loaders import PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_qdrant import QdrantVectorStore
import logging
import os
from .cleaner import clean_documents
from ingestion.loaders.pdf_loader import load_pdf
from ingestion.loaders.youtube_loader import load_youtube
from ingestion.loaders.pptx_loader import load_pptx
from ingestion.loaders.url_loader import load_url
from utils.retry_calling import with_retry

log = logging.getLogger(__name__)


def generate_summary(chunks: list) -> str:
    sample = " ".join(c.page_content for c in chunks[:3])
    return sample[:500] + "..." if len(sample) > 500 else sample


def ingest_source(
    source_type: str,
    embeddings,
    file_bytes: bytes = None,
    filename: str = None,
    url: str = None,
    session_id: str = "default",
) -> dict:
    """
    Route to correct loader based on source type.
    ASSIGNMENT: Supports pdf, youtube, pptx, url — all in one session.
    """

    # ── Load based on type ────────────────────────────────────────────
    if source_type == "pdf":
        docs = load_pdf(file_bytes, filename)
        source_label = filename

    elif source_type == "youtube":
        docs = load_youtube(url)
        source_label = url

    elif source_type == "pptx":
        docs = load_pptx(file_bytes, filename)
        source_label = filename

    elif source_type == "url":
        docs = load_url(url)
        source_label = url

    else:
        raise ValueError(f"Unsupported source type: {source_type}")

    if not docs:
        raise ValueError(f"No content extracted from {source_label}")

    # ── Chunk ─────────────────────────────────────────────────────────
    if source_type == "url":
        splitter = RecursiveCharacterTextSplitter(
        chunk_size=300,    # smaller chunks
        chunk_overlap=30,
    )
    else:
        splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50,
    )
    chunks = splitter.split_documents(docs)
    # After chunking, adding session_id to every chunk metadata
    for chunk in chunks:
        chunk.metadata["session_id"] = session_id
    log.info(f"Split into {len(chunks)} chunks")

    # ── Summary ───────────────────────────────────────────────────────
    summary = generate_summary(chunks)

    QDRANT_URL        = os.getenv("QDRANT_URL")
    QDRANT_API_KEY    = os.getenv("QDRANT_API_KEY")
    QDRANT_COLLECTION = os.getenv("QDRANT_COLLECTION")


    # ── Store in Qdrant ───────────────────────────────────────────────
    BATCH_SIZE = 20
    for i in range(0, len(chunks), BATCH_SIZE):

        batch = chunks[i:i + BATCH_SIZE]
        with_retry(

             
            lambda b=batch: QdrantVectorStore.from_documents(
            documents=b,
            embedding=embeddings,
            url=QDRANT_URL,
            api_key=QDRANT_API_KEY,
            collection_name=QDRANT_COLLECTION,
        )
    )
    log.info(f"Uploaded batch {i//BATCH_SIZE + 1}/{(len(chunks)-1)//BATCH_SIZE + 1}")

    log.info(f"Ingested {len(chunks)} chunks from {source_label}")

    return {
        "status": "success",
        "source_type": source_type,
        "source": source_label,
        "chunks": len(chunks),
        "summary": summary,
    }