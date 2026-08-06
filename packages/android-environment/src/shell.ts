import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface CommandResult {
  ok: boolean;
  code: number | null;
  stdout: string;
  stderr: string;
  error?: string;
}

export async function runCommand(
  command: string,
  args: string[] = [],
  options?: {
    timeoutMs?: number;
    env?: NodeJS.ProcessEnv;
    cwd?: string;
    shell?: boolean;
  },
): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: options?.timeoutMs ?? 15_000,
      env: options?.env ?? process.env,
      cwd: options?.cwd,
      shell: options?.shell ?? false,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
      encoding: 'utf8',
    });
    return {
      ok: true,
      code: 0,
      stdout: String(stdout ?? '').trim(),
      stderr: String(stderr ?? '').trim(),
    };
  } catch (err) {
    const error = err as Error & {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      killed?: boolean;
    };
    return {
      ok: false,
      code: typeof error.code === 'number' ? error.code : null,
      stdout: String(error.stdout ?? '').trim(),
      stderr: String(error.stderr ?? '').trim(),
      error: error.killed
        ? 'Команда превысила таймаут'
        : error.message || String(err),
    };
  }
}

/** Java prints version to stderr; treat that as success when process exits 0-ish. */
export function combineOutput(result: CommandResult): string {
  return [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
}
