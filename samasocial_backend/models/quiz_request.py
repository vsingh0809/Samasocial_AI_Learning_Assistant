from pydantic import BaseModel


class QuizRequest(BaseModel):
    session_id: str
    num_questions: int = 5 