import { Role } from '@lms/shared';

export type DashboardAreaId = 'student' | 'instructor' | 'admin';

export type NavIconName =
  | 'overview'
  | 'courses'
  | 'cohorts'
  | 'assignments'
  | 'certificates'
  | 'discussions'
  | 'curriculum'
  | 'grading'
  | 'analytics'
  | 'payouts'
  | 'coupons'
  | 'users'
  | 'moderation'
  | 'orders'
  | 'audit'
  | 'settings';

export interface NavItemConfig {
  id: string;
  label: string;
  href: string;
  iconName: NavIconName;
  roles: readonly Role[];
  badge?: string;
  exactMatch?: boolean;
  /** Optional tag indicating which feature package owns the target view. */
  packageOwner?: string;
}

export interface NavSectionConfig {
  id: string;
  title: string;
  items: readonly NavItemConfig[];
}

export interface DashboardAreaConfig {
  id: DashboardAreaId;
  label: string;
  shortLabel: string;
  basePath: `/student` | `/instructor` | `/admin`;
  description: string;
  allowedRoles: readonly Role[];
  sections: readonly NavSectionConfig[];
}

export interface BreadcrumbItem {
  label: string;
  href: string;
  isCurrent: boolean;
}

export const ALL_ROLES: readonly Role[] = [
  Role.STUDENT,
  Role.TEACHING_ASSISTANT,
  Role.INSTRUCTOR,
  Role.ADMIN,
  Role.SUPER_ADMIN,
] as const;

export const INSTRUCTOR_AREA_ROLES: readonly Role[] = [
  Role.TEACHING_ASSISTANT,
  Role.INSTRUCTOR,
  Role.ADMIN,
  Role.SUPER_ADMIN,
] as const;

export const ADMIN_AREA_ROLES: readonly Role[] = [Role.ADMIN, Role.SUPER_ADMIN] as const;

export const DASHBOARD_NAV_CONFIG: Record<DashboardAreaId, DashboardAreaConfig> = {
  student: { id: 'student', label: 'Student Workspace', shortLabel: 'Student', basePath: '/student', description: 'Student Workspace', allowedRoles: ALL_ROLES, sections: [
    { id: 'student-learning', title: 'Learning Studio', items: [
      { id: 'student-overview', label: 'Overview', href: '/student', iconName: 'overview', roles: ALL_ROLES, exactMatch: true, packageOwner: 'P3-F-STUDENT' },
      { id: 'student-courses', label: 'My Courses', href: '/student/enrollments', iconName: 'courses', roles: ALL_ROLES, exactMatch: false, packageOwner: 'P3-F-STUDENT' },
      { id: 'student-results', label: 'Grades & Results', href: '/student/results', iconName: 'grading', roles: ALL_ROLES, exactMatch: false, packageOwner: 'P3-F-STUDENT' },
    ] },
    { id: 'student-records', title: 'Account & Records', items: [
      { id: 'student-certificates', label: 'Certificates', href: '/student/certificates', iconName: 'certificates', roles: ALL_ROLES, exactMatch: false, packageOwner: 'P3-F-STUDENT' },
      { id: 'student-notifications', label: 'Notifications', href: '/student/notifications', iconName: 'discussions', roles: ALL_ROLES, exactMatch: false, packageOwner: 'P3-F-STUDENT' },
      { id: 'student-orders', label: 'Billing & Orders', href: '/student/orders', iconName: 'orders', roles: ALL_ROLES, exactMatch: false, packageOwner: 'P3-F-COMMERCE' },
      { id: 'student-subscriptions', label: 'Subscriptions', href: '/student/subscriptions', iconName: 'orders', roles: ALL_ROLES, exactMatch: false, packageOwner: 'P3-F-COMMERCE' },
      { id: 'student-settings', label: 'Settings', href: '/student/settings', iconName: 'settings', roles: ALL_ROLES, exactMatch: false, packageOwner: 'P3-F-STUDENT' },
    ] },
  ] },
  instructor: { id: 'instructor', label: 'Instructor Studio', shortLabel: 'Instructor', basePath: '/instructor', description: 'Instructor Studio', allowedRoles: INSTRUCTOR_AREA_ROLES, sections: [
    { id: 'instructor-teaching', title: 'Curriculum & Delivery', items: [
      { id: 'instructor-overview', label: 'Studio Overview', href: '/instructor', iconName: 'overview', roles: INSTRUCTOR_AREA_ROLES, exactMatch: true, packageOwner: 'P3-F-ADMIN' },
      { id: 'instructor-courses', label: 'Course Builder', href: '/instructor/courses', iconName: 'curriculum', roles: [Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN], exactMatch: false, packageOwner: 'P2-F-AUTHOR' },
      { id: 'instructor-question-banks', label: 'Question Banks', href: '/instructor/question-banks', iconName: 'curriculum', roles: [Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN], exactMatch: false, packageOwner: 'P2-F-ASSESS' },
      { id: 'instructor-assessments', label: 'Assessments', href: '/instructor/assessments', iconName: 'assignments', roles: [Role.INSTRUCTOR, Role.ADMIN, Role.SUPER_ADMIN], exactMatch: false, packageOwner: 'P2-F-ASSESS' },
      { id: 'instructor-grading', label: 'Grading Queue', href: '/instructor/grading', iconName: 'grading', roles: INSTRUCTOR_AREA_ROLES, exactMatch: false, packageOwner: 'P2-F-ASSESS' },
      { id: 'instructor-learners', label: 'Course Roster', href: '/instructor/learners', iconName: 'cohorts', roles: INSTRUCTOR_AREA_ROLES, exactMatch: false, packageOwner: 'P3-F-ADMIN' },
      { id: 'instructor-analytics', label: 'Studio Analytics', href: '/instructor/analytics', iconName: 'analytics', roles: INSTRUCTOR_AREA_ROLES, exactMatch: false, packageOwner: 'P3-F-ADMIN' },
    ] },
  ] },
  admin: { id: 'admin', label: 'Admin Console', shortLabel: 'Admin', basePath: '/admin', description: 'Admin Console', allowedRoles: ADMIN_AREA_ROLES, sections: [
    { id: 'admin-governance', title: 'Platform Governance', items: [
      { id: 'admin-overview', label: 'System Overview', href: '/admin', iconName: 'overview', roles: ADMIN_AREA_ROLES, exactMatch: true, packageOwner: 'P3-F-ADMIN' },
      { id: 'admin-users', label: 'Users', href: '/admin/users', iconName: 'users', roles: [Role.SUPER_ADMIN], exactMatch: false, packageOwner: 'P3-F-ADMIN' },
      { id: 'admin-workspaces', label: 'Workspaces', href: '/admin/workspaces', iconName: 'settings', roles: [Role.SUPER_ADMIN], exactMatch: false, packageOwner: 'P3-F-ADMIN' },
      { id: 'admin-members', label: 'Team Members', href: '/admin/members', iconName: 'users', roles: ADMIN_AREA_ROLES, exactMatch: false, packageOwner: 'P3-F-ADMIN' },
    ] },
    { id: 'admin-ledger', title: 'Compliance & Ledger', items: [
      { id: 'admin-orders', label: 'Commerce', href: '/admin/commerce', iconName: 'orders', roles: ADMIN_AREA_ROLES, exactMatch: false, packageOwner: 'P3-F-COMMERCE' },
      { id: 'admin-audit', label: 'Audit Logs', href: '/admin/audit', iconName: 'audit', roles: ADMIN_AREA_ROLES, exactMatch: false, packageOwner: 'P3-F-ADMIN' },
      { id: 'admin-operations', label: 'Operations & Outbox', href: '/admin/operations', iconName: 'settings', roles: ADMIN_AREA_ROLES, exactMatch: false, packageOwner: 'P3-F-ADMIN' },
      { id: 'admin-analytics', label: 'Revenue & Reports', href: '/admin/analytics', iconName: 'analytics', roles: ADMIN_AREA_ROLES, exactMatch: false, packageOwner: 'P3-F-ADMIN' },
    ] },
  ] },
};
const VALID_ROLE_SET = new Set<string>(Object.values(Role));

export interface RoleBearingUser {
  platformRole?: string | null;
  memberships?: readonly { role: string }[] | null;
}

/**
 * Extracts a deduplicated list of effective Role values from a `/me` payload.
 * Guarantees at least `[Role.STUDENT]` for any authenticated user object.
 */
export function extractEffectiveRoles(user: RoleBearingUser | null | undefined): Role[] {
  if (!user) return [Role.STUDENT];
  const collected = new Set<Role>([Role.STUDENT]);

  if (user.platformRole && VALID_ROLE_SET.has(user.platformRole)) {
    collected.add(user.platformRole as Role);
  }

  if (Array.isArray(user.memberships)) {
    for (const membership of user.memberships) {
      if (membership && typeof membership.role === 'string' && VALID_ROLE_SET.has(membership.role)) {
        collected.add(membership.role as Role);
      }
    }
  }

  return Array.from(collected);
}

export function canAccessArea(area: DashboardAreaId, userRoles: readonly Role[]): boolean {
  const areaConfig = DASHBOARD_NAV_CONFIG[area];
  return areaConfig.allowedRoles.some((allowed) => userRoles.includes(allowed));
}

export function getAccessibleAreas(userRoles: readonly Role[]): DashboardAreaConfig[] {
  const areas: DashboardAreaId[] = ['student', 'instructor', 'admin'];
  return areas
    .filter((areaId) => canAccessArea(areaId, userRoles))
    .map((areaId) => DASHBOARD_NAV_CONFIG[areaId]);
}

export function getNavSectionsForArea(
  area: DashboardAreaId,
  userRoles: readonly Role[] = ALL_ROLES,
  extraItems?: readonly NavItemConfig[],
): NavSectionConfig[] {
  const areaConfig = DASHBOARD_NAV_CONFIG[area];

  const baseSections = areaConfig.sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => item.roles.some((r) => userRoles.includes(r))),
    }))
    .filter((section) => section.items.length > 0);

  if (extraItems && extraItems.length > 0) {
    const visibleExtra = extraItems.filter((item) =>
      item.roles.some((r) => userRoles.includes(r)),
    );
    if (visibleExtra.length > 0) {
      baseSections.push({
        id: `${area}-extensions`,
        title: 'Extensions',
        items: visibleExtra,
      });
    }
  }

  return baseSections;
}

export function resolveAreaFromPathname(pathname: string): DashboardAreaId {
  if (pathname === '/instructor' || pathname.startsWith('/instructor/')) {
    return 'instructor';
  }
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    return 'admin';
  }
  return 'student';
}

export function resolveDefaultDashboardPath(
  userRoles: readonly Role[],
): '/student' | '/instructor' | '/admin' {
  if (userRoles.includes(Role.SUPER_ADMIN) || userRoles.includes(Role.ADMIN)) {
    return '/admin';
  }
  if (userRoles.includes(Role.INSTRUCTOR) || userRoles.includes(Role.TEACHING_ASSISTANT)) {
    return '/instructor';
  }
  return '/student';
}

export function isNavItemActive(
  pathname: string,
  item: Pick<NavItemConfig, 'href' | 'exactMatch'>,
): boolean {
  if (item.exactMatch) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

const SEGMENT_LABELS: Record<string, string> = {
  student: 'Student Workspace',
  instructor: 'Instructor Studio',
  admin: 'Admin Console',
  courses: 'Courses',
  cohorts: 'Cohorts',
  assignments: 'Assignments & Quizzes',
  certificates: 'Certificates',
  discussions: 'Discussions',
  billing: 'Billing & Orders',
  grading: 'Grading Queue',
  analytics: 'Analytics',
  coupons: 'Coupons',
  payouts: 'Revenue & Payouts',
  users: 'Users & Workspaces',
  moderation: 'Course Moderation',
  orders: 'Orders & Refunds',
  'audit-logs': 'Audit Logs',
  settings: 'Platform Settings',
};

function formatSegmentLabel(segment: string): string {
  const mapped = SEGMENT_LABELS[segment];
  if (mapped) return mapped;
  return segment
    .split('-')
    .map((part) => (part ? part.charAt(0).toUpperCase() + part.slice(1) : ''))
    .join(' ');
}

export function buildBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const cleanPath = (pathname.split('?')[0] ?? '/student').replace(/\/+$/, '') || '/student';
  const segments = cleanPath.split('/').filter(Boolean);

  if (segments.length === 0) {
    return [{ label: 'Workspace', href: '/student', isCurrent: true }];
  }

  const crumbs: BreadcrumbItem[] = [];
  let accumulated = '';

  segments.forEach((segment, idx) => {
    accumulated += `/${segment}`;
    const isLast = idx === segments.length - 1;
    crumbs.push({
      label: formatSegmentLabel(segment),
      href: accumulated,
      isCurrent: isLast,
    });
  });

  if (crumbs.length === 1 && crumbs[0]) {
    crumbs.push({
      label: 'Overview',
      href: crumbs[0].href,
      isCurrent: true,
    });
    crumbs[0] = {
      ...crumbs[0],
      isCurrent: false,
    };
  }

  return crumbs;
}
