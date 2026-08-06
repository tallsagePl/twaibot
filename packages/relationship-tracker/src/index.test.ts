import { describe, expect, it } from 'vitest';
import {
  InMemoryRelationshipReconciler,
  canAdvanceStage,
  nextStage,
  stageFromScan,
} from './index.js';

describe('relationship stage FSM helpers', () => {
  it('allows forward advances and close from any stage', () => {
    expect(canAdvanceStage('incoming-like', 'matched')).toBe(true);
    expect(canAdvanceStage('matched', 'incoming-like')).toBe(false);
    expect(canAdvanceStage('matched', 'closed')).toBe(true);
    expect(canAdvanceStage('closed', 'matched')).toBe(false);
  });

  it('returns next stage in order', () => {
    expect(nextStage('incoming-like')).toBe('matched');
    expect(nextStage('date-completed')).toBeNull();
    expect(nextStage('closed')).toBeNull();
  });

  it('maps scan sources to stages', () => {
    expect(
      stageFromScan({ identityId: 'a', seenIn: 'incoming-likes' }),
    ).toBe('incoming-like');
    expect(stageFromScan({ identityId: 'a', seenIn: 'matches' })).toBe(
      'matched',
    );
    expect(
      stageFromScan({
        identityId: 'a',
        seenIn: 'dialogs',
        dialogDepth: 'telegram',
      }),
    ).toBe('telegram-exchanged');
  });
});

describe('InMemoryRelationshipReconciler', () => {
  it('adds new likes, advances to match, closes missing likes', async () => {
    const reconciler = new InMemoryRelationshipReconciler();

    const first = await reconciler.reconcile({
      scannedAt: '2026-08-01T10:00:00.000Z',
      activeSnapshotId: 'snap-1',
      incomingLikes: [
        { identityId: 'c1', seenIn: 'incoming-likes' },
        { identityId: 'c2', seenIn: 'incoming-likes' },
      ],
      matches: [],
      dialogs: [],
    });
    expect(first.added).toHaveLength(2);

    const second = await reconciler.reconcile({
      scannedAt: '2026-08-02T10:00:00.000Z',
      activeSnapshotId: 'snap-1',
      incomingLikes: [{ identityId: 'c1', seenIn: 'incoming-likes' }],
      matches: [{ identityId: 'c1', seenIn: 'matches' }],
      dialogs: [],
    });
    expect(second.advanced.some((r) => r.candidateIdentityId === 'c1')).toBe(
      true,
    );
    expect(second.closed.some((r) => r.candidateIdentityId === 'c2')).toBe(
      true,
    );
    expect(
      reconciler.getCurrent().find((r) => r.candidateIdentityId === 'c1')
        ?.currentStage,
    ).toBe('matched');
  });
});
