export function createId(prefix = "id"): string {
  if (crypto.randomUUID) {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function createSessionId(): string {
  if (crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function getOrCreateSessionId(): string {
  const key = "samasocial_learning_session_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const next = createSessionId();
  localStorage.setItem(key, next);
  return next;
}

export function rotateSessionId(): string {
  const key = "samasocial_learning_session_id";
  const next = createSessionId();
  localStorage.setItem(key, next);
  return next;
}
