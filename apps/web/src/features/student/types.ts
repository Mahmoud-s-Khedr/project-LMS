import type {
  Enrollment,
  EffectiveAccess,
  LearnerOutline,
  LearnerOutlineLesson,
  ReleasedResult,
  StudentAnalytics,
  EnrollmentsQuery,
  GrantSummary,
} from '@lms/shared';
import type { z } from 'zod';
import type { enrollmentsQuerySchema } from '@lms/shared';

export type {
  Enrollment,
  EffectiveAccess,
  LearnerOutline,
  LearnerOutlineLesson,
  ReleasedResult,
  StudentAnalytics,
  EnrollmentsQuery,
  GrantSummary,
};

export type EnrollmentsQueryParams = z.input<typeof enrollmentsQuerySchema>;

export function isAccessAllowed(access: EffectiveAccess | undefined | null): boolean {
  return access?.allowed === true;
}

export function formatSecondsToDuration(secondsStrOrNum: string | number | null | undefined): string {
  if (secondsStrOrNum === null || secondsStrOrNum === undefined) return '0 min';
  const totalSeconds = typeof secondsStrOrNum === 'string' ? Number(secondsStrOrNum) : secondsStrOrNum;
  if (isNaN(totalSeconds) || totalSeconds <= 0) return '0 min';

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  return `${minutes} min`;
}

export function formatAccessReason(reason: string | undefined | null): string {
  if (!reason) return 'Access Restricted';
  switch (reason) {
    case 'ACCESS_EXPIRED':
      return 'Access Expired';
    case 'ENROLLMENT_REQUIRED':
      return 'Enrollment Required';
    case 'CONTENT_LOCKED':
      return 'Content Locked';
    case 'PREREQUISITE_UNMET':
      return 'Prerequisite Unmet';
    case 'USER_SUSPENDED':
      return 'Account Suspended';
    case 'WORKSPACE_SUSPENDED':
      return 'Workspace Suspended';
    case 'ENROLLMENT_SUSPENDED':
      return 'Enrollment Suspended';
    case 'NOT_RELEASED':
      return 'Scheduled Content (Not Released Yet)';
    case 'AVAILABLE_UNTIL_PASSED':
      return 'Availability Period Ended';
    default:
      return reason.replace(/_/g, ' ');
  }
}

export function formatDateString(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  } catch {
    return isoString;
  }
}

export function formatDateTimeString(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } catch {
    return isoString;
  }
}
