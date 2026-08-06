import type { DesktopApi } from '@twinby/contracts';

export function getDesktopApi(): DesktopApi {
  const api = window.desktopApi;
  if (!api) {
    throw new Error(
      'desktopApi недоступен. Preload не загрузился — перезапустите приложение.',
    );
  }
  return api;
}
