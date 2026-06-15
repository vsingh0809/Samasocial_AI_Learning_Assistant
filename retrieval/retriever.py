# retrieval/retriever.py
import os
import logging
from collections import defaultdict
from typing import AsyncGenerator

from langchain_qdrant import QdrantVectorStore
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import HumanMessage, AIMessage
from qdrant_client.models import Filter, FieldCondition, MatchValue


log = logging.getLogger(__name__)

# ── Session stores ────────────────────────────────────────────────────
# WHY IN-MEMORY:
# Free tier — no Redis needed for demo
# Resets on container restart — acceptable
# Production: replace with Azure Cache for Redis
session_store: dict[str, list] = defaultdict(list)
session_sources: dict[str, list] = defaultdict(list)  # tracks sources per session

MAX_HISTORY = 10


# ══════════════════════════════════════════════════════════════════════
# VECTORSTORE
# ══════════════════════════════════════════════════════════════════════
def get_vectorstore(embeddings):
    try:
        vs = QdrantVectorStore.from_existing_collection(
            embedding=embeddings,
            url=os.getenv("QDRANT_URL"),
            api_key=os.getenv("QDRANT_API_KEY"),
            collection_name=os.getenv("QDRANT_COLLECTION"),
        )
        log.info("Connected to Qdrant.")
        return vs
    except Exception as e:
        log.error(f"Qdrant connection failed: {e}")
        return None


# ══════════════════════════════════════════════════════════════════════
# HISTORY HELPERS
# ══════════════════════════════════════════════════════════════════════
def format_history(messages: list) -> str:
    if not messages:
        return "No previous conversation."
    lines = []
    for msg in messages[-MAX_HISTORY:]:
        role = "User" if isinstance(msg, HumanMessage) else "Assistant"
        lines.append(f"{role}: {msg.content}")
    return "\n".join(lines)


def save_to_history(session_id: str, question: str, answer: str):
    session_store[session_id].append(HumanMessage(content=question))
    session_store[session_id].append(AIMessage(content=answer))
    # Trim
    if len(session_store[session_id]) > MAX_HISTORY * 2:
        session_store[session_id] = session_store[session_id][-MAX_HISTORY * 2:]


def get_session_sources(session_id: str) -> list:
    return session_sources.get(session_id, [])


def update_session_sources(session_id: str, docs: list):
    """Track which sources were used in this session."""
    existing = {s["source"] for s in session_sources[session_id]}
    for doc in docs:
        source = doc.metadata.get("source_file", "Unknown")
        source_type = doc.metadata.get("source_type", "unknown")
        if source not in existing:
            session_sources[session_id].append({
                "source": source,
                "source_type": source_type,
            })
            existing.add(source)


# ══════════════════════════════════════════════════════════════════════
# PROMPT
# ══════════════════════════════════════════════════════════════════════
def build_prompt() -> ChatPromptTemplate:
    return ChatPromptTemplate.from_template("""
You are a helpful AI learning assistant for Samasocial.
Answer questions based ONLY on the provided document context.

Previous conversation:
{history}

Context from documents:
{context}

Rules:
- Answer ONLY from the context above
- ALWAYS cite your source using the citation tag provided e.g. [Page 3 of notes.pdf] or [at 2:30 in the video]
- If the answer is not in the context, say exactly: "I don't have that information in the provided sources."
- For follow-up questions, stay consistent with previous answers
- Explain concepts simply when asked
- Decline out-of-scope questions politely

Question: {question}

Answer:""")


# ══════════════════════════════════════════════════════════════════════
# RETRIEVE DOCS + BUILD CONTEXT
# ══════════════════════════════════════════════════════════════════════

def retrieve_and_build_context(vs, question: str, session_id: str):
    """Retrieve docs filtered by session_id only."""

    # WHY FILTER:
    # Without filter → retrieves ALL users' documents
    # With filter → only this session's uploaded documents
    # Free tier friendly — no extra collections needed
    session_filter = Filter(
        must=[
            FieldCondition(
                key="metadata.session_id",
                match=MatchValue(value=session_id),
            )
        ]
    )

    retriever = vs.as_retriever(
        search_kwargs={
            "k": 5,
            "filter": session_filter,   # ← FILTER HERE
        }
    )

    try:
        docs = retriever.invoke(question)
    except Exception as e:
        log.error(f"Retrieval failed: {e}")
        raise

    if not docs:
        return "No relevant content found in your uploaded documents.", [], []

    context_parts = []
    citations = []

    for doc in docs:
        citation = doc.metadata.get(
            "citation",
            doc.metadata.get("source_file", "Unknown source")
        )
        citations.append(citation)
        context_parts.append(f"[{citation}]\n{doc.page_content}")

    context = "\n\n---\n\n".join(context_parts)
    update_session_sources(session_id, docs)

    sources = list(set(
        doc.metadata.get("source_file", "Unknown")
        for doc in docs
    ))

    return context, citations, sources
# ══════════════════════════════════════════════════════════════════════
# QUERY — Non-streaming
# ══════════════════════════════════════════════════════════════════════
def query(
    question: str,
    embeddings,
    llm,
    session_id: str = "default",
) -> dict:
    if not question.strip():
        raise ValueError("Question cannot be empty.")

    vs = get_vectorstore(embeddings)
    if vs is None:
        raise ConnectionError("Could not connect to Qdrant.")

    history_text = format_history(session_store[session_id])
    context, citations, sources = retrieve_and_build_context(vs, question, session_id)

    prompt = build_prompt()
    chain = prompt | llm | StrOutputParser()

    try:
        answer = chain.invoke({
            "history": history_text,
            "context": context,
            "question": question,
        })
    except Exception as e:
        log.error(f"LLM chain failed: {e}")
        raise

    save_to_history(session_id, question, answer)
    log.info(f"Query answered — session: {session_id}")

    return {
        "answer": answer,
        "sources": sources,
        "citations": citations,
        "session_id": session_id,
    }


# ══════════════════════════════════════════════════════════════════════
# STREAM QUERY — token by token
# ══════════════════════════════════════════════════════════════════════
async def stream_query(
    question: str,
    embeddings,
    llm,
    session_id: str = "default",
) -> AsyncGenerator[str, None]:
    """
    Stream LLM response token by token.
    ASSIGNMENT: Streaming responses — chatbot streams reply token by token.
    WHY ASYNC GENERATOR:
    Yields each token as it arrives from Azure OpenAI
    Frontend receives and displays progressively
    No waiting for full response
    """
    if not question.strip():
        raise ValueError("Question cannot be empty.")

    vs = get_vectorstore(embeddings)
    if vs is None:
        raise ConnectionError("Could not connect to Qdrant.")

    history_text = format_history(session_store[session_id])
    context, citations, sources = retrieve_and_build_context(vs, question, session_id)

    prompt = build_prompt()

    # Format prompt manually for streaming
    formatted = prompt.format_messages(
        history=history_text,
        context=context,
        question=question,
    )

    full_answer = ""

    try:
        # WHY astream NOT stream:
        # astream = async streaming — works in FastAPI async context
        # stream = sync — blocks event loop in async FastAPI
        async for chunk in llm.astream(formatted):
            token = chunk.content
            if token:
                full_answer += token
                yield token

    except Exception as e:
        log.error(f"Stream failed: {e}")
        yield "[ERROR] Streaming failed."
        return

    # Save complete answer to history after stream finishes
    save_to_history(session_id, question, full_answer)

    # Send sources as final SSE event
    # WHY SEND AT END:
    # Sources only known after retrieval
    # Stream tokens first, metadata last
    import json
    yield f"\n[SOURCES]{json.dumps({'sources': sources, 'citations': citations, 'session_id': session_id})}"


# ══════════════════════════════════════════════════════════════════════
# QUIZ GENERATION — ASSIGNMENT BONUS
# ══════════════════════════════════════════════════════════════════════
async def generate_quiz_questions(
    session_id: str,
    embeddings,
    llm,
    num_questions: int = 5,
) -> list[dict]:
    """
    Generate quiz questions from loaded content.
    ASSIGNMENT BONUS: Auto-generate questions based on loaded content.
    """
    vs = get_vectorstore(embeddings)
    if vs is None:
        raise ConnectionError("Could not connect to Qdrant.")

    # Get a broad sample of content
    retriever = vs.as_retriever(search_kwargs={"k": 10})
    try:
        docs = retriever.invoke("main topics concepts summary")
    except Exception as e:
        log.error(f"Quiz retrieval failed: {e}")
        raise

    if not docs:
        raise ValueError("No content found to generate quiz from.")

    context = "\n\n".join(doc.page_content for doc in docs[:8])

    prompt = ChatPromptTemplate.from_template("""
You are a quiz generator for an AI learning platform.
Based on the following content, generate exactly {num_questions} quiz questions.

Content:
{context}

Rules:
- Each question must be answerable from the content
- Mix different difficulty levels (easy, medium, hard)
- Include the correct answer and a brief explanation
- Format as JSON array ONLY, no extra text

Format:
[
  {{
    "question": "...",
    "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
    "correct": "A",
    "explanation": "...",
    "difficulty": "easy|medium|hard"
  }}
]

JSON output:""")

    chain = prompt | llm | StrOutputParser()

    try:
        result = chain.invoke({
            "context": context,
            "num_questions": num_questions,
        })

        # Parse JSON safely
        import json
        import re

        # Extract JSON array from response
        json_match = re.search(r'\[.*\]', result, re.DOTALL)
        if not json_match:
            raise ValueError("LLM did not return valid JSON")

        questions = json.loads(json_match.group())
        log.info(f"Generated {len(questions)} quiz questions")
        return questions

    except json.JSONDecodeError as e:
        log.error(f"Quiz JSON parse failed: {e}")
        raise ValueError("Failed to parse quiz questions.")
    except Exception as e:
        log.error(f"Quiz generation failed: {e}")
        raise