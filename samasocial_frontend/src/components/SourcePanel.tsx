import { FileText, Globe2, Link, Loader2, Presentation, TriangleAlert, Youtube } from "lucide-react";
import { ACCEPTED_EXTENSIONS, ACCEPTED_FILE_TYPES, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from "../config";
import type { SourceItem, SourceKind } from "../types";
import { detectUrlKind, isLikelyUrl } from "../utils/source";

interface SourcePanelProps {
  sources: SourceItem[];
  urlValue: string;
  urlError?: string;
  fileError?: string;
  isBusy: boolean;
  onUrlChange: (value: string) => void;
  onUrlSubmit: (url: string, kind: SourceKind) => void;
  onFilesSelected: (files: File[]) => void;
  onRemoveSource: (id: string) => void;
}

const kindLabels: Record<SourceKind, string> = {
  pdf: "PDF",
  pptx: "Slides",
  youtube: "YouTube",
  webpage: "Webpage",
  unknown: "Source",
};

function SourceIcon({ kind }: { kind: SourceKind }) {
  if (kind === "pdf") return <FileText size={18} />;
  if (kind === "pptx") return <Presentation size={18} />;
  if (kind === "youtube") return <Youtube size={18} />;
  if (kind === "webpage") return <Globe2 size={18} />;
  return <Link size={18} />;
}

export function SourcePanel({
  sources,
  urlValue,
  urlError,
  fileError,
  isBusy,
  onUrlChange,
  onUrlSubmit,
  onFilesSelected,
  onRemoveSource,
}: SourcePanelProps) {
  function handleFiles(files: FileList | null) {
    if (!files) return;
    const validFiles = Array.from(files).filter((file) => {
      const extensionAllowed = ACCEPTED_EXTENSIONS.some((extension) =>
        file.name.toLowerCase().endsWith(extension),
      );
      const typeAllowed = !file.type || ACCEPTED_FILE_TYPES.includes(file.type);
      return extensionAllowed && typeAllowed && file.size <= MAX_FILE_SIZE_BYTES;
    });

    onFilesSelected(validFiles);
  }

  function submitUrl(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = urlValue.trim();
    if (!trimmed || !isLikelyUrl(trimmed)) return;
    onUrlSubmit(trimmed, detectUrlKind(trimmed));
  }

  return (
    <aside className="source-panel" aria-label="Knowledge sources">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Knowledge Base</p>
          <h1>Samasocial AI Assistant</h1>
        </div>
      </div>

      <label className="drop-zone">
        <input
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(",")}
          onChange={(event) => handleFiles(event.target.files)}
          disabled={isBusy}
        />
        <FileText size={24} />
        <span>Add PDF or PPTX files</span>
        <small>Max {MAX_FILE_SIZE_MB} MB each. Multiple files are supported.</small>
      </label>
      {fileError ? (
        <p className="field-error">
          <TriangleAlert size={15} /> {fileError}
        </p>
      ) : null}

      <form className="url-form" onSubmit={submitUrl}>
        <label htmlFor="source-url">YouTube or webpage URL</label>
        <div className="url-input-row">
          <input
            id="source-url"
            value={urlValue}
            onChange={(event) => onUrlChange(event.target.value)}
            placeholder="https://..."
            inputMode="url"
            disabled={isBusy}
          />
          <button type="submit" disabled={!isLikelyUrl(urlValue.trim()) || isBusy}>
            {isBusy ? <Loader2 className="spin" size={18} /> : <Link size={18} />}
            Add
          </button>
        </div>
        {urlError ? (
          <p className="field-error">
            <TriangleAlert size={15} /> {urlError}
          </p>
        ) : null}
      </form>

      <div className="source-list" aria-live="polite">
        <div className="list-title">
          <span>Loaded sources</span>
          <strong>{sources.filter((source) => source.status === "ready").length}</strong>
        </div>

        {sources.length === 0 ? (
          <div className="empty-state">
            Add at least one source to start grounded Q&A.
          </div>
        ) : (
          sources.map((source) => (
            <article className={`source-card ${source.status}`} key={source.id}>
              <div className="source-card-top">
                <span className="source-icon">
                  <SourceIcon kind={source.kind} />
                </span>
                <div>
                  <strong>{source.label}</strong>
                  <small>{kindLabels[source.kind]} · {source.status}</small>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  aria-label={`Remove ${source.label}`}
                  onClick={() => onRemoveSource(source.id)}
                >
                  x
                </button>
              </div>
              {source.detail ? <p>{source.detail}</p> : null}
              {source.summary ? <p className="summary">{source.summary}</p> : null}
            </article>
          ))
        )}
      </div>
    </aside>
  );
}
