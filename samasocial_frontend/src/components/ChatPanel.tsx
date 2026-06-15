import { Bot, CircleStop, GraduationCap, Loader2, Send, Sparkles, Trash2, UserRound } from "lucide-react";
import type { ChatMessage, SourceItem } from "../types";
import { useAutoScroll } from "../hooks/useAutoScroll";

interface ChatPanelProps {
  messages: ChatMessage[];
  question: string;
  mode: "chat" | "quiz";
  readySources: SourceItem[];
  isStreaming: boolean;
  onQuestionChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  onModeChange: (mode: "chat" | "quiz") => void;
  onClearChat: () => void;
}

export function ChatPanel({
  messages,
  question,
  mode,
  readySources,
  isStreaming,
  onQuestionChange,
  onSubmit,
  onStop,
  onModeChange,
  onClearChat,
}: ChatPanelProps) {
  const bottomRef = useAutoScroll(messages);
  const canAsk = readySources.length > 0 && question.trim().length > 0 && !isStreaming;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (canAsk) onSubmit();
  }

  return (
    <main className="chat-panel">
      <header className="chat-header">
        <div>
          <p className="eyebrow">Grounded Chat</p>
          <h2>Ask doubts, request explanations, or generate a quiz</h2>
        </div>
        <div className="chat-actions">
          <div className="mode-toggle" role="tablist" aria-label="Assistant mode">
            <button
              type="button"
              className={mode === "chat" ? "active" : ""}
              onClick={() => onModeChange("chat")}
            >
              <Bot size={16} /> Chat
            </button>
            <button
              type="button"
              className={mode === "quiz" ? "active" : ""}
              onClick={() => onModeChange("quiz")}
            >
              <GraduationCap size={16} /> Quiz me
            </button>
          </div>
          <button
            className="clear-chat-button"
            type="button"
            onClick={onClearChat}
            disabled={messages.length === 0 || isStreaming}
            title="Clear chat"
          >
            <Trash2 size={16} /> Clear
          </button>
        </div>
      </header>

      <section className="message-list" aria-live="polite">
        {messages.length === 0 ? (
          <div className="welcome">
            <Sparkles size={26} />
            <h3>Load a source, then ask from the material.</h3>
            <p>
              The assistant should cite the provided content and decline questions outside the uploaded
              knowledge base.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <article className={`message ${message.role} ${message.error ? "error" : ""}`} key={message.id}>
              <div className="avatar" aria-hidden="true">
                {message.role === "user" ? <UserRound size={18} /> : <Bot size={18} />}
              </div>
              <div className="bubble">
                <p>{message.content || (message.pending ? "Thinking..." : "")}</p>
                {message.pending ? <Loader2 className="spin pending-icon" size={16} /> : null}
                {message.citations?.length ? (
                  <div className="citations">
                    {message.citations.map((citation, index) => (
                      <span key={`${message.id}_${index}`}>
                        {citation.label || citation.source || citation.url || "Source"}
                        {citation.page ? ` · p.${citation.page}` : ""}
                        {citation.slide ? ` · slide ${citation.slide}` : ""}
                        {citation.timestamp ? ` · ${citation.timestamp}` : ""}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </article>
          ))
        )}
        <div ref={bottomRef} />
      </section>

      <form className="composer" onSubmit={handleSubmit}>
        <textarea
          value={question}
          onChange={(event) => onQuestionChange(event.target.value)}
          placeholder={
            readySources.length
              ? mode === "quiz"
                ? "Generate 5 quiz questions from the loaded content..."
                : "Ask something grounded in your sources..."
              : "Add a source first..."
          }
          rows={2}
          disabled={readySources.length === 0}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (canAsk) onSubmit();
            }
          }}
        />
        {isStreaming ? (
          <button className="send-button stop" type="button" onClick={onStop}>
            <CircleStop size={18} /> Stop
          </button>
        ) : (
          <button className="send-button" type="submit" disabled={!canAsk}>
            <Send size={18} /> Send
          </button>
        )}
      </form>
    </main>
  );
}
