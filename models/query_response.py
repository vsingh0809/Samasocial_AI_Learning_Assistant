from pydantic import BaseModel

class QueryResponse(BaseModel):
    answer: str
    sources: list[str] = []
    citations: list[str] = []     # ASSIGNMENT: "from slide 4", "at 3:22"
    session_id: str
    status: str = "success"