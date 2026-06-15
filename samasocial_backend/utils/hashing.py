import logging
import hashlib

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def generate_file_hash(file_bytes:bytes)->str:
    """WHY SHA256:
    - Deterministic — same file always same hash
    - Collision resistant — different files never same hash
    - Fast enough for files up to 100MB"""
    hash_value=hashlib.sha256(file_bytes).hexdigest
    logger.info(f"Generated hash: {hash_value[:16]}...")
    return hash_value


