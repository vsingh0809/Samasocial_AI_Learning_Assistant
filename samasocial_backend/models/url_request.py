from pydantic import BaseModel

class URLRequest(BaseModel):
    url: str
    source_type: str
    session_id: str = ""