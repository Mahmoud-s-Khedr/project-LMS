import { z } from 'zod';

/** Heartbeats may credit at most the server-observed wall-clock gap plus this jitter allowance. */
export const PLAYBACK_JITTER_SECONDS = 5;
/** A first heartbeat has no previous server contact to bound it; credit is capped here. */
export const FIRST_HEARTBEAT_CREDIT_CAP_SECONDS = 30;
/** Client `occurredAt` is only stored within this window around server receipt. */
export const EVENT_CLOCK_SKEW_MS = 5 * 60 * 1000;

/** floor(done/total*100) with two decimals using integers, so 999/1000 never displays as 100. */
export function floorPercent(done: number, total: number): string {
  if (total <= 0 || done <= 0) return '0';
  const hundredths = Math.min(10000, Math.floor((done * 10000) / total));
  const whole = Math.floor(hundredths / 100);
  const frac = hundredths % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0').replace(/0$/, '')}`;
}
export function percentToNumber(value: string | { toString(): string }): number {
  return Number(value.toString());
}

/**
 * Seconds of playback the server is willing to credit for one heartbeat. The client's claim is an upper
 * bound only: credit can never exceed real elapsed server time since the last contact (+ jitter) so replayed
 * or fabricated heartbeats cannot fast-forward a video.
 */
export function playbackCredit(input: {
  claimedElapsedSeconds: number;
  lastContactAt: Date | null;
  now: Date;
}): number {
  const claimed = Math.max(0, Math.min(120, Math.floor(input.claimedElapsedSeconds)));
  if (!input.lastContactAt) return Math.min(claimed, FIRST_HEARTBEAT_CREDIT_CAP_SECONDS);
  const gap = Math.max(0, (input.now.getTime() - input.lastContactAt.getTime()) / 1000);
  return Math.min(claimed, Math.floor(gap + PLAYBACK_JITTER_SECONDS));
}

export function clampOccurredAt(occurredAt: Date, now: Date): Date {
  const min = now.getTime() - EVENT_CLOCK_SKEW_MS;
  return new Date(Math.min(now.getTime(), Math.max(min, occurredAt.getTime())));
}

/** Frozen when learning starts; later authoring edits never dilute or re-define completion. */
export const completionSnapshotSchema = z.strictObject({
  version: z.literal(1),
  frozenAt: z.iso.datetime(),
  requiredLessonIds: z.array(z.uuid()).max(5000),
  criteria: z.record(
    z.uuid(),
    z.strictObject({
      rule: z.enum(['VIEW', 'ACKNOWLEDGE', 'WATCH_PERCENT', 'ASSESSMENT_PASS', 'ATTENDANCE']),
      requiredWatchPercent: z.number().int().min(1).max(100),
    }),
  ),
});
export type CompletionSnapshot = z.infer<typeof completionSnapshotSchema>;
export function parseSnapshot(value: unknown): CompletionSnapshot | null {
  const parsed = completionSnapshotSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
