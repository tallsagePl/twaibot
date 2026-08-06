import type { Locator } from '@twinby/contracts';
import type { ManagedAppiumClient } from '@twinby/appium-client';

export interface ElementBounds {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

/**
 * Resolve Twinby locator against live Appium session.
 * relative-tap uses bounds of `of` resource-id from page source or findElement.
 */
export class LocatorExecutor {
  constructor(private readonly client: ManagedAppiumClient) {}

  async resolveBoundsByResourceId(
    resourceId: string,
    pageSource?: string,
  ): Promise<ElementBounds> {
    const source = pageSource ?? (await this.client.getPageSource()).source;
    const fromXml = parseBoundsForResourceId(source, resourceId);
    if (fromXml) {
      return fromXml;
    }
    const elementId = await this.client.findElement('resource-id', resourceId);
    const rect = await this.client.getElementRect(elementId);
    return {
      left: rect.x,
      top: rect.y,
      width: rect.width,
      height: rect.height,
      right: rect.x + rect.width,
      bottom: rect.y + rect.height,
    };
  }

  async tapLocator(locator: Locator, pageSource?: string): Promise<void> {
    if (locator.strategy === 'relative-tap') {
      if (locator.xRatio == null || locator.yRatio == null) {
        throw new Error('relative-tap требует xRatio, yRatio');
      }
      const of = locator.of ?? '__window__';
      let bounds: ElementBounds;
      if (of === '__window__') {
        const rect = await this.client.getWindowRect();
        bounds = {
          left: rect.x,
          top: rect.y,
          width: rect.width,
          height: rect.height,
          right: rect.x + rect.width,
          bottom: rect.y + rect.height,
        };
      } else {
        bounds = await this.resolveBoundsByResourceId(of, pageSource);
      }
      const x = bounds.left + bounds.width * locator.xRatio;
      const y = bounds.top + bounds.height * locator.yRatio;
      await this.client.tap(x, y);
      return;
    }

    if (!locator.value) {
      throw new Error(`Locator ${locator.strategy} без value`);
    }

    if (
      locator.strategy === 'accessibility-id' ||
      locator.strategy === 'resource-id' ||
      locator.strategy === 'text' ||
      locator.strategy === 'xpath'
    ) {
      const elementId = await this.client.findElement(locator.strategy, locator.value);
      await this.client.clickElement(elementId);
      return;
    }

    throw new Error(`Неизвестная стратегия локатора: ${locator.strategy}`);
  }

  async swipeOnResourceId(
    resourceId: string,
    direction: 'up' | 'down' | 'left' | 'right',
    pageSource?: string,
  ): Promise<void> {
    const bounds = await this.resolveBoundsByResourceId(resourceId, pageSource);
    const insetX = Math.round(bounds.width * 0.15);
    const insetY = Math.round(bounds.height * 0.2);
    await this.client.swipe({
      left: bounds.left + insetX,
      top: bounds.top + insetY,
      width: Math.max(10, bounds.width - insetX * 2),
      height: Math.max(10, bounds.height - insetY * 2),
      direction,
      percent: 0.6,
    });
  }
}

export function parseBoundsForResourceId(
  pageSource: string,
  resourceId: string,
): ElementBounds | null {
  // Prefer the first displayed ProfileCard-like node with this id
  const escaped = resourceId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(
    `resource-id="${escaped}"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
    'g',
  );
  const match = re.exec(pageSource);
  if (!match) {
    // bounds may appear before resource-id in some dumps
    const re2 = new RegExp(
      `bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"[^>]*resource-id="${escaped}"`,
    );
    const m2 = re2.exec(pageSource);
    if (!m2) {
      return null;
    }
    return boundsFromParts(m2[1]!, m2[2]!, m2[3]!, m2[4]!);
  }
  return boundsFromParts(match[1]!, match[2]!, match[3]!, match[4]!);
}

function boundsFromParts(
  l: string,
  t: string,
  r: string,
  b: string,
): ElementBounds {
  const left = Number(l);
  const top = Number(t);
  const right = Number(r);
  const bottom = Number(b);
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
    right,
    bottom,
  };
}
