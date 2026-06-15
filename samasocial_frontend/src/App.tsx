import { useEffect, useMemo, useRef, useState } from "react";
import { ChatPanel } from "./components/ChatPanel";
import { SourcePanel } from "./components/SourcePanel";
import { StatusBar } from "./components/StatusBar";
import {
  checkApiHealth,
  deleteSession,
  fetchSessionSources,
  generateQuiz,
  ingestFile,
  ingestUrl,
  streamQuery,
} from "./services/api";
import type { ChatMessage, SourceItem, SourceKind } from "./types";
import { createId, getOrCreateSessionId, rotateSessionId } from "./utils/ids";
import { detectFileKind } from "./utils/source";
import { getRejectedFileMessage } from "./utils/validation";
import "./styles.css";

export default function App() {
  const [sessionId, setSessionId] = useState(getOrCreateSessionId);
  const [sources, setSources] = useState<SourceItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<"chat" | "quiz">("chat");
  const [urlValue, setUrlValue] = useState("");
  const [urlError, setUrlError] = useState<string>();
  const [fileError, setFileError] = useState<string>();
  const [isBusy, setIsBusy] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [apiReachable, setApiReachable] = useState<boolean>();
  const abortRef = useRef<AbortController | null>(null);

  const readySources = useMemo(
    () => sources.filter((source) => source.status === "ready"),
    [sources],
  );

  useEffect(() => {
    checkApiHealth().then(setApiReachable);
  }, []);

  useEffect(() => {
    let isMounted = true;

    fetchSessionSources(sessionId)
      .then((response) => {
        if (!isMounted || !response.sources?.length) return;
        setSources(
          response.sources.map((source, index) => ({
            id: `${sessionId}_${index}_${source.source || "source"}`,
            kind:
              source.source_type === "url"
                ? "webpage"
                : source.source_type === "pdf" ||
                    source.source_type === "pptx" ||
                    source.source_type === "youtube"
                  ? source.source_type
                  : "unknown",
            label: source.source || "Session source",
            status: "ready",
            detail: source.chunks ? `${source.chunks} chunks indexed.` : "Ready for questions.",
            createdAt: Date.now(),
          })),
        );
      })
      .catch(() => {
        // Source hydration is best-effort; ingestion and chat still work without it.
      });

    return () => {
      isMounted = false;
    };
  }, [sessionId]);

  async function handleFilesSelected(files: File[]) {
    const rejectedMessage = getRejectedFileMessage(files);
    if (rejectedMessage) {
      setFileError(rejectedMessage);
      return;
    }
    if (!files.length) {
      setFileError("Choose a PDF, PPT, or PPTX file under the size limit.");
      return;
    }

    setFileError(undefined);
    setIsBusy(true);

    for (const file of files) {
      const tempId = createId("source");
      const optimistic: SourceItem = {
        id: tempId,
        kind: detectFileKind(file),
        label: file.name,
        status: "processing",
        detail: "Extracting text, chunking, and indexing...",
        createdAt: Date.now(),
      };

      setSources((current) => [optimistic, ...current]);

      try {
        const result = await ingestFile(file, sessionId);
        setSources((current) =>
          current.map((source) =>
            source.id === tempId
              ? {
                  ...source,
                  id: result.sourceId || source.id,
                  kind: result.kind || source.kind,
                  label: result.label || source.label,
                  status: "ready",
                  summary: result.summary,
                  detail: result.detail || "Ready for questions.",
                }
              : source,
          ),
        );
      } catch (error) {
        setSources((current) =>
          current.map((source) =>
            source.id === tempId
              ? {
                  ...source,
                  status: "failed",
                  detail: error instanceof Error ? error.message : "File ingestion failed.",
                }
              : source,
          ),
        );
      }
    }

    setIsBusy(false);
  }

  async function handleUrlSubmit(url: string, kind: SourceKind) {
    if (sources.some((source) => source.label === url)) {
      setUrlError("This URL is already in the current session.");
      return;
    }

    const tempId = createId("source");
    setUrlError(undefined);
    setUrlValue("");
    setIsBusy(true);
    setSources((current) => [
      {
        id: tempId,
        kind,
        label: url,
        status: "processing",
        detail: kind === "youtube" ? "Fetching transcript or summary..." : "Scraping and indexing page...",
        createdAt: Date.now(),
      },
      ...current,
    ]);

    try {
      const result = await ingestUrl(url, kind, sessionId);
      setSources((current) =>
        current.map((source) =>
          source.id === tempId
            ? {
                ...source,
                id: result.sourceId || source.id,
                kind: result.kind || source.kind,
                label: result.label || source.label,
                status: "ready",
                summary: result.summary,
                detail: result.detail || "Ready for questions.",
              }
            : source,
        ),
      );
    } catch (error) {
      setSources((current) =>
        current.map((source) =>
          source.id === tempId
            ? {
                ...source,
                status: "failed",
                detail: error instanceof Error ? error.message : "URL ingestion failed.",
              }
            : source,
        ),
      );
    } finally {
      setIsBusy(false);
    }
  }

  function removeSource(id: string) {
    setSources((current) => current.filter((source) => source.id !== id));
  }

  async function submitQuestion() {
    const trimmed = question.trim();
    if (!trimmed || isStreaming || readySources.length === 0) return;

    const userMessage: ChatMessage = {
      id: createId("message"),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };
    const assistantId = createId("message");
    const assistantMessage: ChatMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      pending: true,
      createdAt: Date.now(),
    };

    const nextMessages = [...messages, userMessage, assistantMessage];
    setMessages(nextMessages);
    setQuestion("");
    setIsStreaming(true);
    abortRef.current = new AbortController();

    try {
      if (mode === "quiz") {
        const quiz = await generateQuiz(sessionId, 5);
        setMessages((current) =>
          current.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: formatQuizResponse(quiz),
                  pending: false,
                }
              : message,
          ),
        );
        return;
      }

      await streamQuery(
        {
          question: trimmed,
          sessionId,
          mode,
          history: messages.slice(-10).map(({ role, content }) => ({ role, content })),
          sourceIds: readySources.map((source) => source.id),
        },
        (update) => {
          if (update.error) throw new Error(update.error);

          setMessages((current) =>
            current.map((message) => {
              if (message.id !== assistantId) return message;
              return {
                ...message,
                content: update.answer ?? `${message.content}${update.token || ""}`,
                citations: update.citations?.length ? update.citations : message.citations,
                pending: update.done ? false : message.pending,
              };
            }),
          );
        },
        abortRef.current.signal,
      );
    } catch (error) {
      const wasAborted = error instanceof DOMException && error.name === "AbortError";
      setMessages((current) =>
        current.map((message) =>
          message.id === assistantId
            ? {
                ...message,
                content: wasAborted
                  ? `${message.content}\n\nResponse stopped.`
                  : error instanceof Error
                    ? error.message
                    : "The assistant could not complete this request.",
                pending: false,
                error: !wasAborted,
              }
            : message,
        ),
      );
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  }

  function stopStreaming() {
    abortRef.current?.abort();
  }

  function clearChat() {
    setMessages([]);
    setQuestion("");
  }

  async function startNewSession() {
    abortRef.current?.abort();
    setIsBusy(true);
    setIsStreaming(false);

    try {
      await deleteSession(sessionId);
    } catch {
      // A missing/expired backend session should not block starting fresh locally.
    } finally {
      const nextSessionId = rotateSessionId();
      setSessionId(nextSessionId);
      setSources([]);
      setMessages([]);
      setQuestion("");
      setUrlValue("");
      setUrlError(undefined);
      setFileError(undefined);
      setIsBusy(false);
    }
  }

  return (
    <div className="app-shell">
      <SourcePanel
        sources={sources}
        urlValue={urlValue}
        urlError={urlError}
        fileError={fileError}
        isBusy={isBusy}
        onUrlChange={setUrlValue}
        onUrlSubmit={handleUrlSubmit}
        onFilesSelected={handleFilesSelected}
        onRemoveSource={removeSource}
      />
      <ChatPanel
        messages={messages}
        question={question}
        mode={mode}
        readySources={readySources}
        isStreaming={isStreaming}
        onQuestionChange={setQuestion}
        onSubmit={submitQuestion}
        onStop={stopStreaming}
        onModeChange={setMode}
        onClearChat={clearChat}
      />
      <StatusBar
        apiReachable={apiReachable}
        sessionId={sessionId}
        isBusy={isBusy || isStreaming}
        onNewSession={startNewSession}
      />
    </div>
  );
}

function formatQuizResponse(value: unknown): string {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const questions = Array.isArray(record.questions) ? record.questions : [];

  if (!questions.length) {
    return "I could not generate quiz questions from this session yet. Try asking a normal question first or ingest another source.";
  }

  return questions
    .map((item, index) => {
      if (!item || typeof item !== "object") return `${index + 1}. ${String(item)}`;
      const question = item as Record<string, unknown>;
      const options = Array.isArray(question.options)
        ? `\n${question.options.map((option) => `   ${String(option)}`).join("\n")}`
        : "";
      const correct = question.correct ? `\nAnswer: ${String(question.correct)}` : "";
      const explanation = question.explanation ? `\nWhy: ${String(question.explanation)}` : "";
      const difficulty = question.difficulty ? ` [${String(question.difficulty)}]` : "";
      return `${index + 1}. ${String(question.question || "Quiz question")}${difficulty}${options}${correct}${explanation}`;
    })
    .join("\n\n");
}
