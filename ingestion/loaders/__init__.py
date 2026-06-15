# ingestion/loaders/pdf_loader.py
import logging
import tempfile
import os
from langchain_community.document_loaders import PyPDFLoader
from langchain_core.documents import Document
from ingestion.cleaner import clean_documents

log = logging.getLogger(__name__)

def load_pdf(file_bytes: bytes, filename: str) -> list[Document]:
    """
    Load and clean PDF file.
    ASSIGNMENT: Core source type — already working.
    """
    suffix = os.path.splitext(filename)[1]
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file_bytes)
        tmp_path = tmp.name

    try:
        loader = PyPDFLoader(tmp_path)
        docs = loader.load()
        log.info(f"PDF loaded: {len(docs)} pages")

        # Add source metadata
        for doc in docs:
            doc.metadata["source_type"] = "pdf"
            doc.metadata["source_file"] = filename
            # ASSIGNMENT: "from page 3" citation
            doc.metadata["citation"] = f"Page {doc.metadata.get('page', 0) + 1} of {filename}"

        return clean_documents(docs)
    finally:
        os.unlink(tmp_path)