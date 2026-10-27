import {
  evaluateEnrollmentAccess,
  evaluateLessonAccess,
  grantIsValid,
  type AccessEnrollment,
  type AccessGrant,
  type LessonFacts,
} from './availability';

const d = (iso: string) => new Date(iso);
const T0 = d('2026-03-01T00:00:00.000Z');
const grant = (over: Partial<AccessGrant> = {}): AccessGrant => ({
  startsAt: d('2026-01-01T00:00:00Z'),
  expiresAt: null,
  revokedAt: null,
  ...over,
});
const enrollment = (over: Partial<AccessEnrollment> = {}): AccessEnrollment => ({
  status: 'ACTIVE',
  enrolledAt: d('2026-02-01T00:00:00Z'),
  user: { status: 'ACTIVE', deletedAt: null },
  workspace: { status: 'ACTIVE', deletedAt: null },
  course: { deletedAt: null },
  cohort: null,
  grants: [grant()],
  ...over,
});
const lesson = (over: Partial<LessonFacts['lesson']> = {}): LessonFacts => ({
  lesson: {
    isPublished: true,
    deletedAt: null,
    sectionDeletedAt: null,
    releaseType: 'IMMEDIATE',
    releaseAt: null,
    releaseOffsetDays: null,
    availableUntil: null,
    ...over,
  },
  cohortRelease: null,
  coursePrerequisiteUnmet: false,
  incompletePrerequisiteLessons: 0,
});

describe('grant window boundaries (fake clock)', () => {
  const g = grant({ startsAt: d('2026-03-01T00:00:00Z'), expiresAt: d('2026-04-01T00:00:00Z') });
  it('is inclusive at startsAt and exclusive at expiresAt', () => {
    expect(grantIsValid(g, d('2026-02-28T23:59:59.999Z'))).toBe(false);
    expect(grantIsValid(g, d('2026-03-01T00:00:00.000Z'))).toBe(true);
    expect(grantIsValid(g, d('2026-03-31T23:59:59.999Z'))).toBe(true);
    expect(grantIsValid(g, d('2026-04-01T00:00:00.000Z'))).toBe(false);
  });
  it('a future revocation keeps access until that instant', () => {
    const r = grant({ revokedAt: d('2026-03-10T00:00:00Z') });
    expect(grantIsValid(r, d('2026-03-09T23:59:59.999Z'))).toBe(true);
    expect(grantIsValid(r, d('2026-03-10T00:00:00Z'))).toBe(false);
  });
});

describe('evaluateEnrollmentAccess', () => {
  it('allows with an unlimited grant', () => {
    expect(evaluateEnrollmentAccess(enrollment(), T0)).toEqual({ allowed: true, expiresAt: null });
  });
  it('reports the latest valid expiry across independent grants', () => {
    const e = enrollment({
      grants: [
        grant({ expiresAt: d('2026-03-10T00:00:00Z') }),
        grant({ expiresAt: d('2026-05-10T00:00:00Z') }),
      ],
    });
    expect(evaluateEnrollmentAccess(e, T0)).toEqual({
      allowed: true,
      expiresAt: '2026-05-10T00:00:00.000Z',
    });
  });
  it('revoking one source leaves independent sources authorizing access', () => {
    const e = enrollment({ grants: [grant({ revokedAt: d('2026-02-15T00:00:00Z') }), grant()] });
    expect(evaluateEnrollmentAccess(e, T0).allowed).toBe(true);
  });
  it('denies ACCESS_EXPIRED only after the final expiry', () => {
    const e = enrollment({ grants: [grant({ expiresAt: d('2026-03-01T00:00:00Z') })] });
    expect(evaluateEnrollmentAccess(e, d('2026-02-28T23:59:59.999Z')).allowed).toBe(true);
    expect(evaluateEnrollmentAccess(e, T0)).toEqual({
      allowed: false,
      reason: 'ACCESS_EXPIRED',
      unlockAt: null,
    });
  });
  it('requires an enrollment when every grant was revoked or none exist', () => {
    expect(evaluateEnrollmentAccess(enrollment({ grants: [] }), T0)).toMatchObject({
      reason: 'ENROLLMENT_REQUIRED',
    });
    expect(
      evaluateEnrollmentAccess(
        enrollment({ grants: [grant({ revokedAt: d('2026-01-02T00:00:00Z') })] }),
        T0,
      ),
    ).toMatchObject({ reason: 'ENROLLMENT_REQUIRED' });
  });
  it('exposes unlockAt for a not-yet-started grant', () => {
    const e = enrollment({ grants: [grant({ startsAt: d('2026-03-05T00:00:00Z') })] });
    expect(evaluateEnrollmentAccess(e, T0)).toEqual({
      allowed: false,
      reason: 'NOT_RELEASED',
      unlockAt: '2026-03-05T00:00:00.000Z',
    });
  });
  it('suspension overrides every valid grant', () => {
    expect(evaluateEnrollmentAccess(enrollment({ status: 'SUSPENDED' }), T0)).toMatchObject({
      reason: 'ENROLLMENT_SUSPENDED',
    });
    expect(evaluateEnrollmentAccess(enrollment({ status: 'REVOKED' }), T0).allowed).toBe(false);
  });
  it('rejects suspended users and workspaces and deleted courses', () => {
    expect(
      evaluateEnrollmentAccess(enrollment({ user: { status: 'SUSPENDED', deletedAt: null } }), T0),
    ).toMatchObject({ reason: 'USER_SUSPENDED' });
    expect(
      evaluateEnrollmentAccess(
        enrollment({ workspace: { status: 'SUSPENDED', deletedAt: null } }),
        T0,
      ),
    ).toMatchObject({ reason: 'WORKSPACE_SUSPENDED' });
    expect(
      evaluateEnrollmentAccess(enrollment({ course: { deletedAt: d('2026-01-01T00:00:00Z') } }), T0)
        .allowed,
    ).toBe(false);
  });
  it('cohort end is an outer bound on an unlimited grant (exclusive)', () => {
    const e = enrollment({
      cohort: { startsAt: d('2026-02-01T00:00:00Z'), endsAt: d('2026-04-01T00:00:00Z') },
    });
    expect(evaluateEnrollmentAccess(e, d('2026-03-31T23:59:59.999Z'))).toEqual({
      allowed: true,
      expiresAt: '2026-04-01T00:00:00.000Z',
    });
    expect(evaluateEnrollmentAccess(e, d('2026-04-01T00:00:00Z'))).toMatchObject({
      reason: 'ACCESS_EXPIRED',
    });
  });
});

describe('evaluateLessonAccess', () => {
  it('inherits enrollment denial', () => {
    expect(evaluateLessonAccess(enrollment({ status: 'SUSPENDED' }), lesson(), T0)).toMatchObject({
      reason: 'ENROLLMENT_SUSPENDED',
    });
  });
  it('locks unpublished or deleted lessons', () => {
    expect(evaluateLessonAccess(enrollment(), lesson({ isPublished: false }), T0)).toMatchObject({
      reason: 'CONTENT_LOCKED',
    });
    expect(
      evaluateLessonAccess(
        enrollment(),
        lesson({ sectionDeletedAt: d('2026-01-01T00:00:00Z') }),
        T0,
      ),
    ).toMatchObject({ reason: 'CONTENT_LOCKED' });
  });
  it('ABSOLUTE drip opens inclusively and reports unlockAt before', () => {
    const f = lesson({ releaseType: 'ABSOLUTE', releaseAt: d('2026-03-10T00:00:00Z') });
    expect(evaluateLessonAccess(enrollment(), f, d('2026-03-09T23:59:59.999Z'))).toEqual({
      allowed: false,
      reason: 'NOT_RELEASED',
      unlockAt: '2026-03-10T00:00:00.000Z',
    });
    expect(evaluateLessonAccess(enrollment(), f, d('2026-03-10T00:00:00Z')).allowed).toBe(true);
  });
  it('ENROLLMENT_OFFSET counts UTC days from enrolledAt', () => {
    const f = lesson({ releaseType: 'ENROLLMENT_OFFSET', releaseOffsetDays: 7 });
    expect(evaluateLessonAccess(enrollment(), f, d('2026-02-07T23:59:59.999Z'))).toMatchObject({
      reason: 'NOT_RELEASED',
      unlockAt: '2026-02-08T00:00:00.000Z',
    });
    expect(evaluateLessonAccess(enrollment(), f, d('2026-02-08T00:00:00Z')).allowed).toBe(true);
  });
  it('COHORT_OFFSET follows the cohort start and moves with a cohort change', () => {
    const f = lesson({ releaseType: 'COHORT_OFFSET', releaseOffsetDays: 2 });
    const a = enrollment({ cohort: { startsAt: d('2026-03-10T00:00:00Z'), endsAt: null } });
    const b = enrollment({ cohort: { startsAt: d('2026-03-20T00:00:00Z'), endsAt: null } });
    const at = d('2026-03-13T00:00:00Z');
    expect(evaluateLessonAccess(a, f, at).allowed).toBe(true);
    expect(evaluateLessonAccess(b, f, at)).toMatchObject({
      reason: 'NOT_RELEASED',
      unlockAt: '2026-03-22T00:00:00.000Z',
    });
  });
  it('COHORT_OFFSET without a cohort is never satisfiable', () => {
    const f = lesson({ releaseType: 'COHORT_OFFSET', releaseOffsetDays: 0 });
    expect(evaluateLessonAccess(enrollment(), f, T0)).toMatchObject({ reason: 'CONTENT_LOCKED' });
  });
  it('per-cohort release overrides the lesson default', () => {
    const f = {
      ...lesson(),
      cohortRelease: { releaseAt: d('2026-04-01T00:00:00Z'), availableUntil: null },
    };
    expect(evaluateLessonAccess(enrollment(), f, T0)).toMatchObject({ reason: 'NOT_RELEASED' });
  });
  it('availableUntil closes access exclusively', () => {
    const f = lesson({ availableUntil: d('2026-03-02T00:00:00Z') });
    expect(evaluateLessonAccess(enrollment(), f, d('2026-03-01T23:59:59.999Z'))).toEqual({
      allowed: true,
      expiresAt: '2026-03-02T00:00:00.000Z',
    });
    expect(evaluateLessonAccess(enrollment(), f, d('2026-03-02T00:00:00Z'))).toMatchObject({
      reason: 'AVAILABLE_UNTIL_PASSED',
    });
  });
  it('course and lesson prerequisites block with PREREQUISITE_UNMET', () => {
    expect(
      evaluateLessonAccess(enrollment(), { ...lesson(), coursePrerequisiteUnmet: true }, T0),
    ).toMatchObject({ reason: 'PREREQUISITE_UNMET' });
    expect(
      evaluateLessonAccess(enrollment(), { ...lesson(), incompletePrerequisiteLessons: 1 }, T0),
    ).toMatchObject({ reason: 'PREREQUISITE_UNMET' });
  });
  it('lesson expiry reported is the earliest of grant expiry and lesson close', () => {
    const e = enrollment({ grants: [grant({ expiresAt: d('2026-03-05T00:00:00Z') })] });
    const f = lesson({ availableUntil: d('2026-03-09T00:00:00Z') });
    expect(evaluateLessonAccess(e, f, T0)).toEqual({
      allowed: true,
      expiresAt: '2026-03-05T00:00:00.000Z',
    });
  });
});
