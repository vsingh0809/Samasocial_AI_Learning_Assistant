import logging
import os
import tempfile
from langchain_community.document_loaders import PyPDFLoader
from langchain_core.documents import Document
from ingestion.cleaner import clean_documents

log = logging.getLogger(__name__)

def load_pdf(file_bytes: bytes, filename: str) -> list[Document]:
    """
    Load, parse, and clean a PDF file from memory securely without leaking resources.
    
    Args:
        file_bytes: The raw binary data of the PDF.
        filename: The original name of the file (used for extension extraction and metadata).
    """
    suffix = os.path.splitext(filename)[1]
    tmp_path = None

    try:
        # 1. Securely provision the temporary file inside the try block
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        
        log.info(f"Successfully staged temporary file for processing: {filename}")

        # 2. Parse the PDF
        loader = PyPDFLoader(tmp_path)
        docs = loader.load()
        log.info(f"PDF parsed successfully: {filename} ({len(docs)} pages)")

        # 3. Enrich metadata uniformly
        total_pages = len(docs)
        for doc in docs:
            current_page = doc.metadata.get("page", 0) + 1
            doc.metadata.update({
                "source_type": "pdf",
                "source_file": filename,
                "citation": f"Page {current_page} of {filename}",
                "total_pages": total_pages
            })

        # 4. Clean and return data structural representations
        return clean_documents(docs)

    except Exception as e:
        log.error(f"Failed to process and parse PDF '{filename}': {str(e)}", exc_info=True)
        raise

    finally:
        # 5. GUARANTEED CLEANUP: This executes even if staging or parsing crashes
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
                log.debug(f"Cleaned up temporary file: {tmp_path}")
            except Exception as cleanup_error:
                log.warning(f"Failed to delete temp file {tmp_path}: {str(cleanup_error)}")