export class AppiumHttpError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'AppiumHttpError';
  }
}

export interface AppiumHttpClientOptions {
  baseUrl: string;
  timeoutMs?: number;
}

export class AppiumHttpClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options: AppiumHttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  get url(): string {
    return this.baseUrl;
  }

  async getStatus(): Promise<{
    ready: boolean;
    message?: string;
    build?: { version?: string };
  }> {
    const json = await this.request<{
      value?: {
        ready?: boolean;
        message?: string;
        build?: { version?: string };
      };
    }>('GET', '/status');
    return {
      ready: Boolean(json.value?.ready),
      message: json.value?.message,
      build: json.value?.build,
    };
  }

  async createSession(capabilities: Record<string, unknown>): Promise<{
    sessionId: string;
    capabilities: Record<string, unknown>;
  }> {
    const json = await this.request<{
      value?: {
        sessionId?: string;
        capabilities?: Record<string, unknown>;
      };
      sessionId?: string;
    }>('POST', '/session', {
      capabilities: {
        alwaysMatch: capabilities,
        firstMatch: [{}],
      },
    });

    const sessionId = json.value?.sessionId ?? json.sessionId;
    if (!sessionId) {
      throw new AppiumHttpError('Appium не вернул sessionId', undefined, json);
    }
    return {
      sessionId,
      capabilities: json.value?.capabilities ?? {},
    };
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.request('DELETE', `/session/${encodeURIComponent(sessionId)}`);
  }

  async screenshot(sessionId: string): Promise<string> {
    const json = await this.request<{ value?: string }>(
      'GET',
      `/session/${encodeURIComponent(sessionId)}/screenshot`,
    );
    if (!json.value) {
      throw new AppiumHttpError('Пустой screenshot от Appium');
    }
    return json.value;
  }

  async source(sessionId: string): Promise<string> {
    const json = await this.request<{ value?: string }>(
      'GET',
      `/session/${encodeURIComponent(sessionId)}/source`,
    );
    if (typeof json.value !== 'string') {
      throw new AppiumHttpError('Пустой page source от Appium');
    }
    return json.value;
  }

  async executeScript(
    sessionId: string,
    script: string,
    args: unknown[] = [],
  ): Promise<unknown> {
    const json = await this.request<{ value?: unknown }>(
      'POST',
      `/session/${encodeURIComponent(sessionId)}/execute/sync`,
      { script, args },
    );
    return json.value;
  }

  async back(sessionId: string): Promise<void> {
    await this.request('POST', `/session/${encodeURIComponent(sessionId)}/back`);
  }

  async getWindowRect(sessionId: string): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> {
    const json = await this.request<{
      value?: { x: number; y: number; width: number; height: number };
    }>('GET', `/session/${encodeURIComponent(sessionId)}/window/rect`);
    if (!json.value) {
      throw new AppiumHttpError('Не удалось получить window rect');
    }
    return json.value;
  }

  async findElement(
    sessionId: string,
    using: string,
    value: string,
  ): Promise<string> {
    const json = await this.request<{
      value?: { ELEMENT?: string; 'element-6066-11e4-a52e-4f735466cecf'?: string };
    }>('POST', `/session/${encodeURIComponent(sessionId)}/element`, {
      using,
      value,
    });
    const id =
      json.value?.['element-6066-11e4-a52e-4f735466cecf'] ?? json.value?.ELEMENT;
    if (!id) {
      throw new AppiumHttpError(`Элемент не найден: ${using}=${value}`, undefined, json);
    }
    return id;
  }

  async getElementRect(
    sessionId: string,
    elementId: string,
  ): Promise<{ x: number; y: number; width: number; height: number }> {
    const json = await this.request<{
      value?: { x: number; y: number; width: number; height: number };
    }>(
      'GET',
      `/session/${encodeURIComponent(sessionId)}/element/${encodeURIComponent(elementId)}/rect`,
    );
    if (!json.value) {
      throw new AppiumHttpError('Не удалось получить element rect');
    }
    return json.value;
  }

  async clickElement(sessionId: string, elementId: string): Promise<void> {
    await this.request(
      'POST',
      `/session/${encodeURIComponent(sessionId)}/element/${encodeURIComponent(elementId)}/click`,
    );
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await response.text();
      let json: unknown = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text };
      }

      if (!response.ok) {
        const message =
          (json as { value?: { message?: string; error?: string } })?.value
            ?.message ||
          (json as { value?: { error?: string } })?.value?.error ||
          `Appium HTTP ${response.status}`;
        throw new AppiumHttpError(message, response.status, json);
      }
      return json as T;
    } catch (err) {
      if (err instanceof AppiumHttpError) {
        throw err;
      }
      if (err instanceof Error && err.name === 'AbortError') {
        throw new AppiumHttpError(`Таймаут Appium ${method} ${path}`);
      }
      throw new AppiumHttpError(
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

export async function probeAppiumStatus(
  baseUrl: string,
  timeoutMs = 3000,
): Promise<{ ok: boolean; ready: boolean; version?: string; error?: string }> {
  try {
    const client = new AppiumHttpClient({ baseUrl, timeoutMs });
    const status = await client.getStatus();
    return {
      ok: true,
      ready: status.ready,
      version: status.build?.version,
    };
  } catch (err) {
    return {
      ok: false,
      ready: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
