import type { TwinbyActionExecutor } from '@twinby/twinby-adapter';
import {
  bioFingerprintFromText,
  buildCompositeFingerprint,
  readOpenedProfileFromSource,
} from '@twinby/twinby-adapter';
import { SharpImagePipeline } from '@twinby/image-pipeline';

export interface CapturedCandidateIdentity {
  identityFingerprint: string;
  name?: string;
  age?: number;
  primaryPhotoHash?: string;
  bioFingerprint?: string;
  bioSnippet?: string;
  city?: string;
  distanceKm?: number;
  goal?: string;
  interests: string[];
  compatibilityPercent?: number;
}

const images = new SharpImagePipeline();

/**
 * Read identity from currently open Twinby profile-details screen (§19 / §21.2).
 * Hero photo pHash from upper screenshot region (no Twinby API ids).
 */
export async function captureOpenCandidateIdentity(
  actions: TwinbyActionExecutor,
): Promise<CapturedCandidateIdentity> {
  const source = await actions.getPageSource();
  const fields = readOpenedProfileFromSource(source);
  if (!fields.displayName) {
    throw new Error('На открытом экране нет имени анкеты (Name, age)');
  }
  const png = await actions.takeScreenshotPng();
  const rect = await actions.getWindowRect();
  const primaryPhotoHash = await images.perceptualHash(png, {
    left: Math.round(rect.width * 0.05),
    top: Math.round(rect.height * 0.08),
    width: Math.round(rect.width * 0.9),
    height: Math.round(rect.height * 0.55),
  });

  const bioFingerprint = bioFingerprintFromText(fields.bioSnippet ?? '');
  const identityFingerprint = buildCompositeFingerprint({
    name: fields.displayName,
    age: fields.age,
    primaryPhotoHash,
    bioFingerprint,
  });

  return {
    identityFingerprint,
    name: fields.displayName,
    age: fields.age,
    primaryPhotoHash,
    bioFingerprint: bioFingerprint || undefined,
    bioSnippet: fields.bioSnippet,
    city: fields.city,
    distanceKm: fields.distanceKm,
    goal: fields.goal,
    interests: fields.interests,
    compatibilityPercent: fields.compatibilityPercent,
  };
}
