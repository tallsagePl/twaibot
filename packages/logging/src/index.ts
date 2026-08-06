import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import pino, { type Logger } from 'pino';

export const LOG_CATEGORIES = [
  'environment',
  'emulator',
  'adb',
  'appium',
  'twinby-adapter',
  'capture',
  'image',
  'ai',
  'decision',
  'action',
  'session',
  'database',
  'security',
  'ui',
  'app',
  'ipc',
] as const;

export type LogCategory = (typeof LOG_CATEGORIES)[number];

export interface CreateLoggerOptions {
  level?: string;
  logsDir?: string;
  name?: string;
}

const SENSITIVE_KEYS = new Set([
  'apiKey',
  'api_key',
  'authorization',
  'password',
  'secret',
  'token',
  'base64',
  'screenshot',
  'pageSource',
  'bio',
  'name',
]);

function redact(value: unknown, key?: string): unknown {
  if (key && SENSITIVE_KEYS.has(key)) {
    return '[REDACTED]';
  }
  if (Array.isArray(value)) {
    return value.map((item) => redact(item));
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = redact(v, k);
    }
    return result;
  }
  return value;
}

let rootLogger: Logger | null = null;

export function createRootLogger(options: CreateLoggerOptions = {}): Logger {
  const level = options.level ?? process.env.LOG_LEVEL ?? 'info';

  if (options.logsDir && !existsSync(options.logsDir)) {
    mkdirSync(options.logsDir, { recursive: true });
  }

  const destination =
    options.logsDir !== undefined
      ? pino.destination({
          dest: join(options.logsDir, 'app.log'),
          sync: false,
          mkdir: true,
        })
      : pino.destination(1);

  rootLogger = pino(
    {
      name: options.name ?? 'twinby-ai-swiper',
      level,
      redact: {
        paths: [
          'apiKey',
          'api_key',
          'authorization',
          'password',
          'secret',
          'token',
          '*.apiKey',
          '*.secret',
        ],
        censor: '[REDACTED]',
      },
    },
    destination,
  );

  return rootLogger;
}

export function getLogger(category: LogCategory): Logger {
  if (!rootLogger) {
    rootLogger = createRootLogger();
  }
  return rootLogger.child({ category });
}

export function safeLogFields(fields: Record<string, unknown>): Record<string, unknown> {
  return redact(fields) as Record<string, unknown>;
}

export function appendDiagnosticLine(logsDir: string, line: string): void {
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }
  appendFileSync(join(logsDir, 'diagnostic.log'), `${line}\n`, 'utf8');
}

export type { Logger };
