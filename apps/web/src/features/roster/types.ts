import type {
  Enrollment,
  EnrollmentsQuery,
  RosterQuery,
  StaffGrant,
  ManualEnrollment,
  ManualGrant,
  EnrollmentUpdate,
  EffectiveAccess,
  CursorResponse,
} from '@lms/shared';

export type {
  Enrollment,
  EnrollmentsQuery,
  RosterQuery,
  StaffGrant,
  ManualEnrollment,
  ManualGrant,
  EnrollmentUpdate,
  EffectiveAccess,
  CursorResponse,
};

export type StaffEnrollmentDetail = Enrollment & {
  grantProvenance: StaffGrant[];
};
