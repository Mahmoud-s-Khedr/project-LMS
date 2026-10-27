import { describe, expect, it } from 'vitest';
import { Role } from '@lms/shared';
import {
  buildBreadcrumbs,
  canAccessArea,
  DASHBOARD_NAV_CONFIG,
  extractEffectiveRoles,
  getAccessibleAreas,
  getNavSectionsForArea,
  isNavItemActive,
  resolveAreaFromPathname,
  resolveDefaultDashboardPath,
  type NavItemConfig,
} from './nav-config';

describe('Dashboard navigation configuration & role helpers', () => {
  it('defines data-driven nav configurations for student, instructor, and admin areas', () => {
    expect(Object.keys(DASHBOARD_NAV_CONFIG)).toEqual(['student', 'instructor', 'admin']);
    expect(DASHBOARD_NAV_CONFIG.student.basePath).toBe('/student');
    expect(DASHBOARD_NAV_CONFIG.instructor.basePath).toBe('/instructor');
    expect(DASHBOARD_NAV_CONFIG.admin.basePath).toBe('/admin');
  });

  it('extracts deduplicated effective roles from /me payloads', () => {
    expect(extractEffectiveRoles(null)).toEqual([Role.STUDENT]);

    const roles = extractEffectiveRoles({
      platformRole: 'STUDENT',
      memberships: [{ role: 'INSTRUCTOR' }, { role: 'TEACHING_ASSISTANT' }, { role: 'INSTRUCTOR' }],
    });

    expect(roles).toEqual([Role.STUDENT, Role.INSTRUCTOR, Role.TEACHING_ASSISTANT]);
  });

  it('enforces area access permissions by role', () => {
    expect(canAccessArea('student', [Role.STUDENT])).toBe(true);
    expect(canAccessArea('instructor', [Role.STUDENT])).toBe(false);
    expect(canAccessArea('admin', [Role.STUDENT])).toBe(false);

    expect(canAccessArea('instructor', [Role.TEACHING_ASSISTANT])).toBe(true);
    expect(canAccessArea('admin', [Role.INSTRUCTOR])).toBe(false);
    expect(canAccessArea('admin', [Role.ADMIN])).toBe(true);
    expect(canAccessArea('admin', [Role.SUPER_ADMIN])).toBe(true);

    expect(getAccessibleAreas([Role.STUDENT]).map((a) => a.id)).toEqual(['student']);
    expect(getAccessibleAreas([Role.STUDENT, Role.INSTRUCTOR]).map((a) => a.id)).toEqual([
      'student',
      'instructor',
    ]);
    expect(getAccessibleAreas([Role.SUPER_ADMIN]).map((a) => a.id)).toEqual([
      'student',
      'instructor',
      'admin',
    ]);
  });

  it('filters instructor and admin nav items based on granular role permissions', () => {
    const taSections = getNavSectionsForArea('instructor', [Role.TEACHING_ASSISTANT]);
    const taItemIds = taSections.flatMap((s) => s.items.map((i) => i.id));
    expect(taItemIds).toContain('instructor-overview');
    expect(taItemIds).toContain('instructor-grading');
    expect(taItemIds).not.toContain('instructor-courses');
    expect(taItemIds).not.toContain('instructor-assessments');

    const instructorSections = getNavSectionsForArea('instructor', [Role.INSTRUCTOR]);
    const instructorItemIds = instructorSections.flatMap((s) => s.items.map((i) => i.id));
    expect(instructorItemIds).toContain('instructor-courses');
    expect(instructorItemIds).toContain('instructor-assessments');
    expect(instructorItemIds).toContain('instructor-question-banks');

    const workspaceAdminSections = getNavSectionsForArea('admin', [Role.ADMIN]);
    const workspaceAdminIds = workspaceAdminSections.flatMap((s) => s.items.map((i) => i.id));
    expect(workspaceAdminIds).toContain('admin-members');
    expect(workspaceAdminIds).toContain('admin-orders');
    expect(workspaceAdminIds).not.toContain('admin-users');

    const superAdminSections = getNavSectionsForArea('admin', [Role.SUPER_ADMIN]);
    const superAdminIds = superAdminSections.flatMap((s) => s.items.map((i) => i.id));
    expect(superAdminIds).toContain('admin-users');
    expect(superAdminIds).toContain('admin-workspaces');
  });

  it('supports injecting dynamic extension nav items from downstream packages', () => {
    const extra: NavItemConfig[] = [
      {
        id: 'student-bookmarks',
        label: 'Saved Bookmarks',
        href: '/student/bookmarks',
        iconName: 'courses',
        roles: [Role.STUDENT],
        packageOwner: 'P2-FE-PLAYER',
      },
    ];

    const sections = getNavSectionsForArea('student', [Role.STUDENT], extra);
    const extSection = sections.find((s) => s.id === 'student-extensions');
    expect(extSection).toBeDefined();
    expect(extSection?.items[0]?.label).toBe('Saved Bookmarks');
  });

  it('resolves dashboard areas, default paths, active states, and breadcrumbs accurately', () => {
    expect(resolveAreaFromPathname('/student/courses')).toBe('student');
    expect(resolveAreaFromPathname('/instructor/grading')).toBe('instructor');
    expect(resolveAreaFromPathname('/admin/users')).toBe('admin');

    expect(resolveDefaultDashboardPath([Role.STUDENT])).toBe('/student');
    expect(resolveDefaultDashboardPath([Role.STUDENT, Role.INSTRUCTOR])).toBe('/instructor');
    expect(resolveDefaultDashboardPath([Role.STUDENT, Role.SUPER_ADMIN])).toBe('/admin');

    expect(isNavItemActive('/student', { href: '/student', exactMatch: true })).toBe(true);
    expect(isNavItemActive('/student/courses', { href: '/student', exactMatch: true })).toBe(false);
    expect(
      isNavItemActive('/student/courses/123', { href: '/student/courses', exactMatch: false }),
    ).toBe(true);

    const rootCrumbs = buildBreadcrumbs('/instructor');
    expect(rootCrumbs).toEqual([
      { label: 'Instructor Studio', href: '/instructor', isCurrent: false },
      { label: 'Overview', href: '/instructor', isCurrent: true },
    ]);

    const nestedCrumbs = buildBreadcrumbs('/admin/audit-logs');
    expect(nestedCrumbs).toEqual([
      { label: 'Admin Console', href: '/admin', isCurrent: false },
      { label: 'Audit Logs', href: '/admin/audit-logs', isCurrent: true },
    ]);
  });
});
