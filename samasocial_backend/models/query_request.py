from pydantic import BaseModel

class QueryRequest(BaseModel):
    question: str
    session_id: str = "" 
    stream: bool = False