import { API_BASE_URL } from "../config";
import type { Citation, IngestResult, QueryPayload, SessionSourceResponse, SourceKind, StreamUpdate } from "../types";

class ApiError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function parseJsonSafely(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function firstString(record: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function normalizeSourceKind(value: string | undefined, fallback: SourceKind): SourceKind {
  if (value === "url") return "webpage";
  if (value === "pdf" || value === "pptx" || value === "youtube" || value === "webpage") return value;
  return fallback;
}

function backendSourceType(kind: SourceKind): string {
  return kind === "webpage" ? "url" : kind;
}

function normalizeIngestResult(data: unknown, fallback: { label: string; kind: SourceKind }): IngestResult {
  const record = asRecord(data);
  const nested = asRecord(record.source);
  const merged = { ...record, ...nested };
  const sourceValue = record.source;
  const sourceString = typeof sourceValue === "string" ? sourceValue : undefined;
  const rawKind = firstString(merged, ["kind", "type", "source_type"]);

  return {
    sourceId: firstString(merged, ["source_id", "sourceId", "id", "document_id", "doc_id"]),
    label: firstString(merged, ["label", "name", "filename", "title"]) || sourceString || fallback.label,
    kind: normalizeSourceKind(rawKind, fallback.kind),
    summary: firstString(merged, ["summary", "source_summary", "description"]),
    detail: firstString(merged, ["detail", "message", "status"]),
    raw: data,
  };
}

function normalizeCitations(value: unknown): Citation[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (typeof item === "string") {
        return { label: item, text: item };
      }

      const record = asRecord(item);
      return {
        source: firstString(record, ["source", "source_id", "sourceId"]),
        label: firstString(record, ["label", "title", "filename"]),
        page: typeof record.page === "number" ? record.page : undefined,
        slide: typeof record.slide === "number" ? record.slide : undefined,
        timestamp: firstString(record, ["timestamp", "time"]),
        url: firstString(record, ["url", "href"]),
        text: firstString(record, ["text", "snippet", "quote"]),
      };
    })
    .filter((citation) => Object.values(citation).some(Boolean));
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) return;

  const data = asRecord(await parseJsonSafely(response));
  const message =
    firstString(data, ["detail", "message", "error"]) ||
    `Request failed with status ${response.status}`;
  throw new ApiError(message, response.status);
}

export async function ingestFile(file: File, sessionId: string): Promise<IngestResult> {
  const formData = new FormData();
  formData.append("file", file);

  const params = new URLSearchParams({ session_id: sessionId });
  const response = await fetch(`${API_BASE_URL}/ingest/file?${params.toString()}`, {
    method: "POST",
    body: formData,
  });

  await assertOk(response);
  return normalizeIngestResult(await parseJsonSafely(response), {
    label: file.name,
    kind: file.name.toLowerCase().endsWith(".pdf") ? "pdf" : "pptx",
  });
}

export async function ingestUrl(url: string, kind: SourceKind, sessionId: string): Promise<IngestResult> {
  const sourceType = backendSourceType(kind);
  const params = new URLSearchParams({ session_id: sessionId });

  const response = await fetch(`${API_BASE_URL}/ingest/url?${params.toString()}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      source_type: sourceType,
    }),
  });

  await assertOk(response);
  return normalizeIngestResult(await parseJsonSafely(response), {
    label: url,
    kind,
  });
}

function parseStreamLine(line: string): StreamUpdate | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed === "data: [DONE]" || trimmed === "[DONE]") {
    return trimmed ? { done: true } : null;
  }

  const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
  if (!payload) return null;

  if (payload.startsWith("[SOURCES]")) {
    try {
      const parsed = asRecord(JSON.parse(payload.replace("[SOURCES]", "")));
      return {
        citations: normalizeCitations(parsed.citations ?? parsed.sources),
        done: true,
      };
    } catch {
      return { done: true };
    }
  }

  if (payload === "[ERROR]") {
    return { error: "The backend stream failed." };
  }

  try {
    const parsed = asRecord(JSON.parse(payload));
    return {
      token: firstString(parsed, ["token", "delta", "content", "text"]),
      answer: firstString(parsed, ["answer", "response"]),
      citations: normalizeCitations(parsed.citations ?? parsed.sources),
      error: firstString(parsed, ["error", "detail", "message"]),
      done: parsed.done === true,
    };
  } catch {
    return { token: payload };
  }
}

export async function streamQuery(
  payload: QueryPayload,
  onUpdate: (update: StreamUpdate) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      question: payload.question,
      query: payload.question,
      message: payload.question,
      mode: payload.mode || "chat",
      session_id: payload.sessionId,
      stream: true,
    }),
    signal,
  });

  await assertOk(response);

  if (!response.body) {
    const data = asRecord(await parseJsonSafely(response));
    onUpdate({
      answer: firstString(data, ["answer", "response", "message", "content"]) || "",
      citations: normalizeCitations(data.citations ?? data.sources),
      done: true,
    });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";

    for (const line of lines) {
      const update = parseStreamLine(line);
      if (update) onUpdate(update);
    }
  }

  const finalText = buffer + decoder.decode();
  const finalUpdate = parseStreamLine(finalText);
  if (finalUpdate) onUpdate(finalUpdate);
  onUpdate({ done: true });
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`, { method: "GET" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/session/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
  });
  await assertOk(response);
}

export async function fetchSessionSources(sessionId: string): Promise<SessionSourceResponse> {
  const response = await fetch(`${API_BASE_URL}/session/${encodeURIComponent(sessionId)}/sources`, {
    method: "GET",
  });
  await assertOk(response);
  return parseJsonSafely(response) as Promise<SessionSourceResponse>;
}

export async function generateQuiz(sessionId: string, numQuestions = 5): Promise<unknown> {
  const response = await fetch(`${API_BASE_URL}/quiz`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      session_id: sessionId,
      num_questions: numQuestions,
    }),
  });
  await assertOk(response);
  return parseJsonSafely(response);
}
