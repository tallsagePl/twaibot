import {
  DEFAULT_SESSION_LIMITS,
  SessionLimitsSchema,
  type DetectedScreen,
  type LocatorProfile,
  type SessionLimits,
  type TwinbyPackageInfo,
  type TwinbyProfilePreview,
  type TwinbyScreenType,
} from '@twinby/contracts';
import { ActionRateLimiter } from './action-rate-limiter';
import { TwinbyActionExecutor } from './action-executor';
import {
  LocatorExecutor,
  parseBoundsForResourceId,
} from './locator-executor';
import {
  findLocatorProfile,
  getDefaultLocatorProfile,
  listLocatorProfiles,
  profilesDirectory,
} from './locator-profile';
import {
  filterTwinbyInterests,
  isIgnoredTwinbyInterest,
} from './interests-filter';
import { readVisibleProfileFromSource as parseVisibleProfile } from './profile-preview';
import {
  detectScreenFromPageSource,
  extractContentDescs,
  extractResourceIds,
  isBottomNavScreen,
  parseNameAgeFromDesc,
} from './screen-detector';
import {
  bioFingerprintFromText,
  buildCompositeFingerprint,
} from './composite-identity';
import {
  findChatProfileHeader,
  findConversationAvatarBounds,
  findConversationNameHeader,
  readOpenedProfileFromSource,
} from './opened-profile';
import {
  fingerprintFromName,
  parseChatListRows,
  parseIncomingLikeCards,
  parseMatchListRows,
  parseOwnProfileEdit,
} from './page-source-lists';

export type { TwinbyScreenType, TwinbyProfilePreview };
export type {
  ChatListRow,
  IncomingLikeCard,
  MatchListRow,
  OwnProfileEditParse,
  OwnProfilePhotoSlot,
} from './page-source-lists';
export type { BoundsRect, OpenedProfileFields } from './opened-profile';
export type { CompositeIdentityParts } from './composite-identity';

export {
  ActionRateLimiter,
  LocatorExecutor,
  TwinbyActionExecutor,
  bioFingerprintFromText,
  buildCompositeFingerprint,
  detectScreenFromPageSource,
  extractContentDescs,
  extractResourceIds,
  filterTwinbyInterests,
  findChatProfileHeader,
  findConversationAvatarBounds,
  findConversationNameHeader,
  findLocatorProfile,
  fingerprintFromName,
  getDefaultLocatorProfile,
  isBottomNavScreen,
  isIgnoredTwinbyInterest,
  listLocatorProfiles,
  parseBoundsForResourceId,
  parseChatListRows,
  parseIncomingLikeCards,
  parseMatchListRows,
  parseNameAgeFromDesc,
  parseOwnProfileEdit,
  profilesDirectory,
  readOpenedProfileFromSource,
  parseVisibleProfile as readVisibleProfileFromSource,
};

export interface TwinbyAdapter {
  detectPackage(): Promise<TwinbyPackageInfo>;
  detectScreen(pageSource: string): DetectedScreen;
  getLocatorProfile(opts?: {
    appVersion?: string;
    screenWidth?: number;
    screenHeight?: number;
  }): LocatorProfile | null;
  readVisibleProfileFromSource(pageSource: string): TwinbyProfilePreview;
}

/**
 * Discovery-oriented adapter (stage 8).
 * Does NOT perform like/dislike. Capture of all photos + bio — stage 9,
 * gated by ActionRateLimiter + SessionLimits (requireAllPhotos, requireBio).
 */
export class TwinbyDiscoveryAdapter implements TwinbyAdapter {
  detectScreen(pageSource: string): DetectedScreen {
    return detectScreenFromPageSource(pageSource);
  }

  getLocatorProfile(opts?: {
    appVersion?: string;
    screenWidth?: number;
    screenHeight?: number;
  }): LocatorProfile | null {
    return findLocatorProfile(opts ?? {}) ?? getDefaultLocatorProfile();
  }

  async detectPackage(): Promise<TwinbyPackageInfo> {
    return {
      packageName: null,
      installed: false,
    };
  }

  readVisibleProfileFromSource(pageSource: string): TwinbyProfilePreview {
    return parseVisibleProfile(pageSource);
  }
}

export function createActionRateLimiter(limits?: SessionLimits): ActionRateLimiter {
  const resolved = SessionLimitsSchema.parse(limits ?? DEFAULT_SESSION_LIMITS);
  return new ActionRateLimiter(resolved);
}

/** @deprecated */
export class NotImplementedTwinbyAdapter extends TwinbyDiscoveryAdapter {
  override async detectPackage(): Promise<TwinbyPackageInfo> {
    return { packageName: 'com.twinby', installed: false };
  }
}
