import type { DesktopApi } from '@twinby/contracts';

declare global {
  interface Window {
    desktopApi: DesktopApi;
  }
}

export {};
