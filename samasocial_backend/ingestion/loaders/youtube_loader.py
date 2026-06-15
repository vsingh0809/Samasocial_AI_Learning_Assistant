import logging
import re
from langchain_core.documents import Document
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound
import xml.etree.ElementTree as ET

log = logging.getLogger(__name__)

def extract_video_id(url: str) -> str:
    """Extract video ID from standard, shortened, Shorts, and Live YouTube URLs."""
    # Updated regex to handle /shorts/ and /live/ paths cleanly
    patterns = [
        r"(?:v=|\/)([0-9A-Za-z_-]{11})",
        r"(?:shorts\/|live\/)([0-9A-Za-z_-]{11})",
        r"youtu\.be\/([0-9A-Za-z_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    raise ValueError(f"Could not extract a valid 11-character video ID from URL: {url}")

def format_timestamp(seconds: float) -> str:
    mins = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{mins:02d}:{secs:02d}"

def load_youtube(url: str) -> list[Document]:
    """
    Load YouTube video transcript using official captions.
    Groups transcript into ~1 minute chunks with accurate timestamps.
    """
    try:
        video_id = extract_video_id(url)
        log.info(f"Fetching transcript for video: {video_id}")

        transcript = YouTubeTranscriptApi.get_transcript(
            video_id,
            languages=["en", "en-US", "en-GB", "hi"],
        )

    except TranscriptsDisabled:
        raise ValueError("This video has transcripts disabled. Try another video.")
    except NoTranscriptFound:
        raise ValueError("No transcript found for this video. Try a video with captions.")
    except ET.ParseError:
        log.error(f"YouTube anti-bot blocked transcript fetch for {video_id}")
    except Exception as e:
        log.error(f"YouTube API fetch failed for {video_id}: {e}")
        raise ValueError(f"YouTube transcript fetch failed: {e}")

    docs = []
    current_texts = []
    
    # Safely initialize start time
    current_start = transcript[0]["start"] if transcript else 0.0
    chunk_duration_limit = 60.0

    for entry in transcript:
        # Clean internal newlines and weird spacing from the raw caption text
        clean_text = entry["text"].replace("\n", " ").strip()
        
        # 1. Check if adding this entry exceeds our window FIRST
        if entry["start"] - current_start >= chunk_duration_limit:
            # 2. Package the previous chunk
            chunk_text = " ".join(current_texts).strip()
            if chunk_text:
                docs.append(Document(
                    page_content=chunk_text,
                    metadata={
                        "source_type": "youtube",
                        "source_file": url,
                        "video_id": video_id,
                        "start_time": current_start,
                        "citation": f"at {format_timestamp(current_start)} in the video",
                    }
                ))
            
            # 3. Reset the tracker WITH the current entry's data
            current_texts = [clean_text]
            current_start = entry["start"]
        else:
            # Window is still open, just append
            current_texts.append(clean_text)

    # Flush any remaining text in the buffer
    if current_texts:
        chunk_text = " ".join(current_texts).strip()
        if chunk_text:
            docs.append(Document(
                page_content=chunk_text,
                metadata={
                    "source_type": "youtube",
                    "source_file": url,
                    "video_id": video_id,
                    "start_time": current_start,
                    "citation": f"at {format_timestamp(current_start)} in the video",
                }
            ))

    log.info(f"YouTube processing complete: {len(docs)} logical chunks extracted from {url}")
    return docs