import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { shell } from 'electron';
import {
  buildGoogleAuthUrl,
  exchangeGoogleAuthCode,
} from '@twinby/cloud-photo-sources';

function readUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? '/', 'http://127.0.0.1');
}

function sendHtml(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

/**
 * Desktop OAuth loopback: opens browser, catches code on 127.0.0.1, exchanges tokens.
 * Requires Google Cloud OAuth client type "Desktop".
 */
export async function runGoogleDesktopOAuth(input: {
  clientId: string;
  clientSecret: string;
  timeoutMs?: number;
}): Promise<{ accessToken: string; refreshToken: string }> {
  const timeoutMs = input.timeoutMs ?? 180_000;
  const state = randomBytes(16).toString('hex');

  return await new Promise((resolve, reject) => {
    let settled = false;
    const server = createServer((req, res) => {
      void (async () => {
        try {
          const url = readUrl(req);
          if (url.pathname !== '/oauth2callback') {
            sendHtml(res, 404, '<p>Not found</p>');
            return;
          }
          const err = url.searchParams.get('error');
          if (err) {
            sendHtml(
              res,
              400,
              `<p>Авторизация отклонена: ${err}. Можно закрыть окно.</p>`,
            );
            finish(new Error(`Google OAuth: ${err}`));
            return;
          }
          const code = url.searchParams.get('code');
          const returnedState = url.searchParams.get('state');
          if (!code || returnedState !== state) {
            sendHtml(res, 400, '<p>Некорректный OAuth callback.</p>');
            finish(new Error('Google OAuth: некорректный callback'));
            return;
          }

          const tokens = await exchangeGoogleAuthCode({
            clientId: input.clientId,
            clientSecret: input.clientSecret,
            code,
            redirectUri,
          });
          sendHtml(
            res,
            200,
            '<p>Google Drive подключён. Можно закрыть окно и вернуться в Orpheus.</p>',
          );
          finish(null, tokens);
        } catch (error) {
          sendHtml(
            res,
            500,
            `<p>Ошибка OAuth: ${error instanceof Error ? error.message : String(error)}</p>`,
          );
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    });

    let redirectUri = '';
    const timer = setTimeout(() => {
      finish(new Error('Google OAuth: время ожидания авторизации истекло'));
    }, timeoutMs);

    const finish = (
      error: Error | null,
      tokens?: { accessToken: string; refreshToken: string },
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      server.close();
      if (error) reject(error);
      else if (tokens) resolve(tokens);
      else reject(new Error('Google OAuth: пустой результат'));
    };

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        finish(new Error('Google OAuth: не удалось открыть loopback-порт'));
        return;
      }
      redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
      const authUrl = buildGoogleAuthUrl({
        clientId: input.clientId,
        redirectUri,
        state,
      });
      void shell.openExternal(authUrl).catch((error: unknown) => {
        finish(
          error instanceof Error
            ? error
            : new Error('Не удалось открыть браузер для Google OAuth'),
        );
      });
    });

    server.on('error', (error) => {
      finish(error instanceof Error ? error : new Error(String(error)));
    });
  });
}
