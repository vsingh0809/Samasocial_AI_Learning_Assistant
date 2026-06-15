import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from "../config";
import { detectFileKind, formatBytes } from "./source";

export function getRejectedFileMessage(files: File[]): string | undefined {
  const rejected = files.find((file) => {
    const kind = detectFileKind(file);
    return kind === "unknown" || file.size > MAX_FILE_SIZE_BYTES;
  });

  if (!rejected) return undefined;
  if (rejected.size > MAX_FILE_SIZE_BYTES) {
    return `${rejected.name} is ${formatBytes(rejected.size)}. Keep files under ${MAX_FILE_SIZE_MB} MB.`;
  }
  return `${rejected.name} is not a supported PDF, PPT, or PPTX file.`;
}
