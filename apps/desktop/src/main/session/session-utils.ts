import { readFileSync } from 'node:fs';
import type { AiImageInput } from '@twinby/ai-provider';

export function fileToAiImage(
  path: string,
  dataUrl: string | undefined,
  label: string,
): AiImageInput {
  if (dataUrl?.includes('base64,')) {
    const base64 = dataUrl.split('base64,')[1] ?? '';
    return { label, mimeType: 'image/jpeg', base64 };
  }
  const buf = readFileSync(path);
  return { label, mimeType: 'image/jpeg', base64: buf.toString('base64') };
}

export function isRetryableError(message: string): boolean {
  return /timeout|timed out|ECONNRESET|ECONNREFUSED|network|503|502|429|fetch failed|socket|aborted/i.test(
    message,
  );
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
