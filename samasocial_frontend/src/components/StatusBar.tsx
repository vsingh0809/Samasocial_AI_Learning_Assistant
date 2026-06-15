import { CircleCheck, CircleDashed, Cloud, RotateCcw, TriangleAlert } from "lucide-react";
import { API_BASE_URL } from "../config";

interface StatusBarProps {
  apiReachable?: boolean;
  sessionId: string;
  isBusy?: boolean;
  onNewSession: () => void;
}

export function StatusBar({ apiReachable, sessionId, isBusy, onNewSession }: StatusBarProps) {
  return (
    <div className="status-bar">
      <span title={API_BASE_URL}>
        <Cloud size={15} />
        {API_BASE_URL}
      </span>
      <span>
        {apiReachable === undefined ? (
          <CircleDashed size={15} />
        ) : apiReachable ? (
          <CircleCheck size={15} />
        ) : (
          <TriangleAlert size={15} />
        )}
        {apiReachable === undefined ? "Checking API" : apiReachable ? "API reachable" : "API not confirmed"}
      </span>
      <span title={sessionId}>Session {sessionId.slice(-8)}</span>
      <button type="button" onClick={onNewSession} disabled={isBusy} title="Start a new session">
        <RotateCcw size={14} /> New session
      </button>
    </div>
  );
}
