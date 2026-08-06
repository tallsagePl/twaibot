export type PhotoRole =
  | 'main-face'
  | 'full-body'
  | 'lifestyle'
  | 'social'
  | 'intellectual'
  | 'humor'
  | 'conversation-hook'
  | 'activity'
  | 'style'
  | 'emotional'
  | 'trust'
  | 'mystery'
  | 'other';

export interface MetricRange {
  low: number;
  median?: number;
  high: number;
}

export interface ExpectedPerformance {
  incomingLikesPerDay?: MetricRange;
  targetIncomingLikesPerDay?: MetricRange;
  matchesPerSession?: MetricRange;
  targetMatchesPerSession?: MetricRange;
  telegramConversion?: MetricRange;
  confidence: number;
  assumptions: string[];
}

export interface AuthenticityAssessment {
  identityPreservationScore: number;
  strategyAmplificationScore: number;
  directlySupportedSignalCount: number;
  amplifiedSignalCount: number;
  misleadingSignalCount: number;
  fabricatedSignalCount: number;
  blockingConflicts: string[];
  warnings: string[];
}

export interface ProfileAssessment {
  overallScore: number;
  confidence: number;
  strengths: string[];
  weaknesses: string[];
  killerFeatures: string[];
  risks: string[];
  photoRoles: Array<{
    photoId: string;
    role: PhotoRole;
    explanation: string;
  }>;
  authenticity: AuthenticityAssessment;
  expectedPerformance: ExpectedPerformance;
  missingPhotos: string[];
  notes: string[];
  assessedAt: string;
}

export interface ProfileAuditInput {
  profileId?: string;
  name?: string;
  bio?: string;
  photoIds?: string[];
  strategyName?: string;
  constraints?: string[];
}

export interface ProfileAuditService {
  audit(input: ProfileAuditInput): Promise<ProfileAssessment>;
}

function emptyAuthenticity(): AuthenticityAssessment {
  return {
    identityPreservationScore: 0,
    strategyAmplificationScore: 0,
    directlySupportedSignalCount: 0,
    amplifiedSignalCount: 0,
    misleadingSignalCount: 0,
    fabricatedSignalCount: 0,
    blockingConflicts: [],
    warnings: ['Stub auditor: authenticity not evaluated'],
  };
}

/**
 * Typed stub: returns a structured placeholder assessment without LLM.
 * Suitable for wiring until AI provider audit is connected.
 */
export class StubProfileAuditService implements ProfileAuditService {
  async audit(input: ProfileAuditInput): Promise<ProfileAssessment> {
    const photoIds = input.photoIds ?? [];
    const bio = (input.bio ?? '').trim();
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const risks: string[] = [];
    const missingPhotos: string[] = [];

    if (photoIds.length > 0) {
      strengths.push(`Есть ${photoIds.length} фото для оценки`);
    } else {
      weaknesses.push('Нет фото в наборе');
      missingPhotos.push('main-face', 'full-body');
    }
    if (bio.length > 0) {
      strengths.push('Bio заполнено');
    } else {
      weaknesses.push('Bio пустое');
    }
    if ((input.constraints ?? []).length > 0) {
      risks.push('Есть constraints — нужна проверка identity conflicts');
    }

    const overallScore = Math.min(
      100,
      (photoIds.length > 0 ? 40 : 0) + (bio.length > 0 ? 30 : 0) + 10,
    );

    return {
      overallScore,
      confidence: 0.2,
      strengths,
      weaknesses,
      killerFeatures: [],
      risks,
      photoRoles: photoIds.map((photoId, i) => ({
        photoId,
        role: i === 0 ? ('main-face' as const) : ('other' as const),
        explanation: 'Stub role assignment',
      })),
      authenticity: emptyAuthenticity(),
      expectedPerformance: {
        confidence: 0.15,
        assumptions: ['Stub audit — expected performance is a placeholder'],
      },
      missingPhotos,
      notes: [
        `StubProfileAuditService: профиль «${input.name ?? input.profileId ?? 'unnamed'}»`,
        'Подключите AI provider для полноценного auditProfile',
      ],
      assessedAt: new Date().toISOString(),
    };
  }
}
