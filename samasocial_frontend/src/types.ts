export type SourceKind = "pdf" | "pptx" | "youtube" | "webpage" | "unknown";

export type SourceStatus = "queued" | "processing" | "ready" | "failed";

export interface SourceItem {
  id: string;
  kind: SourceKind;
  label: string;
  status: SourceStatus;
  summary?: string;
  detail?: string;
  createdAt: number;
}

export interface Citation {
  source?: string;
  label?: string;
  page?: number;
  slide?: number;
  timestamp?: string;
  url?: string;
  text?: string;
}

export interface ChatMessage {
  id: string;
  role: "assistant" | "user" | "system";
  content: string;
  citations?: Citation[];
  createdAt: number;
  pending?: boolean;
  error?: boolean;
}

export interface IngestResult {
  sourceId?: string;
  label?: string;
  kind?: SourceKind;
  summary?: string;
  detail?: string;
  raw?: unknown;
}

export interface QueryPayload {
  question: string;
  sessionId: string;
  mode?: "chat" | "quiz";
  history: Pick<ChatMessage, "role" | "content">[];
  sourceIds: string[];
}

export interface StreamUpdate {
  token?: string;
  done?: boolean;
  answer?: string;
  citations?: Citation[];
  error?: string;
}

export interface SessionSourceResponse {
  session_id: string;
  sources: Array<{
    source?: string;
    source_type?: string;
    chunks?: number;
  }>;
}
