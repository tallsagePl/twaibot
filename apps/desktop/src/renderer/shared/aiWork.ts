import { useUiStore } from '../app/store';

/** Run an async AI job and keep the global header spinner in sync. */
export async function withAiWork<T>(
  label: string,
  action: () => Promise<T>,
): Promise<T> {
  const { pushAiWork, popAiWork } = useUiStore.getState();
  pushAiWork(label);
  try {
    return await action();
  } finally {
    popAiWork();
  }
}
