import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createWriteStream, type WriteStream } from 'node:fs';
import { join } from 'node:path';
import { probeAppiumStatus } from './http';

export interface AppiumServerManagerOptions {
  host?: string;
  port?: number;
  logsDir?: string;
  startupTimeoutMs?: number;
}

export interface ManagedServerStatus {
  running: boolean;
  ready: boolean;
  url: string;
  owned: boolean;
  pid?: number;
  version?: string;
  error?: string;
}

export class AppiumServerManager {
  private readonly host: string;
  private readonly port: number;
  private readonly logsDir?: string;
  private readonly startupTimeoutMs: number;
  private child: ChildProcessWithoutNullStreams | null = null;
  private logStream: WriteStream | null = null;
  private owned = false;

  constructor(options: AppiumServerManagerOptions = {}) {
    this.host = options.host ?? '127.0.0.1';
    this.port = options.port ?? 4723;
    this.logsDir = options.logsDir;
    this.startupTimeoutMs = options.startupTimeoutMs ?? 60_000;
  }

  get baseUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  async getStatus(): Promise<ManagedServerStatus> {
    const probe = await probeAppiumStatus(this.baseUrl, 2500);
    return {
      running: probe.ok,
      ready: probe.ready,
      url: this.baseUrl,
      owned: this.owned && this.child != null && !this.child.killed,
      pid: this.child?.pid,
      version: probe.version,
      error: probe.error,
    };
  }

  async start(): Promise<ManagedServerStatus> {
    const existing = await probeAppiumStatus(this.baseUrl, 2500);
    if (existing.ok && existing.ready) {
      this.owned = false;
      return {
        running: true,
        ready: true,
        url: this.baseUrl,
        owned: false,
        version: existing.version,
      };
    }

    if (this.child && !this.child.killed) {
      await this.waitUntilReady();
      return this.getStatus();
    }

    this.openLog();
    this.child = spawn(
      'appium',
      ['--address', this.host, '--port', String(this.port), '--session-override'],
      {
        shell: true,
        env: process.env,
        windowsHide: true,
      },
    );
    this.owned = true;

    this.child.stdout.on('data', (chunk: Buffer) => this.writeLog(chunk));
    this.child.stderr.on('data', (chunk: Buffer) => this.writeLog(chunk));
    this.child.on('exit', () => {
      this.owned = false;
      this.child = null;
      this.closeLog();
    });

    await this.waitUntilReady();
    return this.getStatus();
  }

  async stop(): Promise<ManagedServerStatus> {
    if (!this.owned || !this.child) {
      // Do not kill foreign Appium
      return {
        ...(await this.getStatus()),
        owned: false,
        error: this.owned
          ? undefined
          : 'Чужой Appium не останавливаем — закройте его вручную',
      };
    }

    const child = this.child;
    await new Promise<void>((resolve) => {
      const done = () => resolve();
      child.once('exit', done);
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL');
        }
        done();
      }, 5000);
    });
    this.child = null;
    this.owned = false;
    this.closeLog();
    return this.getStatus();
  }

  private async waitUntilReady(): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < this.startupTimeoutMs) {
      const probe = await probeAppiumStatus(this.baseUrl, 2000);
      if (probe.ok && probe.ready) {
        return;
      }
      if (this.child?.exitCode != null) {
        throw new Error(
          `Appium завершился с кодом ${this.child.exitCode}. См. логи appium.`,
        );
      }
      await sleep(500);
    }
    throw new Error(
      `Appium не стал ready за ${Math.round(this.startupTimeoutMs / 1000)} с (${this.baseUrl})`,
    );
  }

  private openLog(): void {
    if (!this.logsDir) {
      return;
    }
    this.closeLog();
    this.logStream = createWriteStream(join(this.logsDir, 'appium.log'), {
      flags: 'a',
    });
    this.writeLog(
      Buffer.from(`\n--- appium start ${new Date().toISOString()} ---\n`),
    );
  }

  private writeLog(chunk: Buffer): void {
    this.logStream?.write(chunk);
  }

  private closeLog(): void {
    this.logStream?.end();
    this.logStream = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
