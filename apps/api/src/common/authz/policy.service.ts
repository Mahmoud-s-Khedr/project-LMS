import { ForbiddenException, Injectable } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { AuthenticatedUser } from './auth.types';

type Actor = Pick<AuthenticatedUser, 'id' | 'platformRole'>;
export type CourseCapability = 'edit' | 'publish' | 'grade' | 'manageLearners';
@Injectable()
export class PolicyService {
  constructor(private readonly prisma: PrismaService) {}
  isPlatformAdmin(user: Actor): boolean {
    return user.platformRole === 'SUPER_ADMIN';
  }
  assertPlatformAdmin(user: Actor): void {
    if (!this.isPlatformAdmin(user))
      throw new ForbiddenException('Platform administrator required');
  }
  isOwner(user: Actor, resource: { userId: string }): boolean {
    return user.id === resource.userId;
  }
  assertOwner(user: Actor, resource: { userId: string }): void {
    if (!this.isOwner(user, resource)) throw new ForbiddenException('Resource owner required');
  }
  async hasWorkspaceRole(
    user: Actor,
    workspaceId: string,
    roles: readonly Role[],
  ): Promise<boolean> {
    const workspace = await this.prisma.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null },
      select: { status: true },
    });
    if (!workspace) return false;
    if (workspace.status !== 'ACTIVE') return false;
    if (this.isPlatformAdmin(user)) return true;
    return !!(await this.prisma.workspaceMember.findFirst({
      where: {
        workspaceId,
        userId: user.id,
        status: 'ACTIVE',
        deletedAt: null,
        role: { in: [...roles] },
        user: { status: 'ACTIVE', deletedAt: null },
      },
      select: { id: true },
    }));
  }
  async assertWorkspaceRole(
    user: Actor,
    workspaceId: string,
    roles: readonly Role[],
  ): Promise<void> {
    if (!(await this.hasWorkspaceRole(user, workspaceId, roles)))
      throw new ForbiddenException('Workspace permission required');
  }
  async canManageCourse(
    user: Actor,
    course: { id: string; workspaceId: string; deletedAt?: Date | null },
    capability: CourseCapability = 'edit',
  ): Promise<boolean> {
    if (course.deletedAt) return false;
    // Resolve canonical scope: caller-supplied course IDs/workspace hints never authorize another tenant.
    const canonical = await this.prisma.course.findFirst({
      where: { id: course.id, workspaceId: course.workspaceId, deletedAt: null },
      select: { id: true },
    });
    if (!canonical) return false;
    if (await this.hasWorkspaceRole(user, course.workspaceId, ['ADMIN'])) return true;
    if (
      !(await this.hasWorkspaceRole(user, course.workspaceId, ['INSTRUCTOR', 'TEACHING_ASSISTANT']))
    )
      return false;
    const staff = await this.prisma.courseStaff.findUnique({
      where: { courseId_userId: { courseId: course.id, userId: user.id } },
    });
    if (!staff || staff.workspaceId !== course.workspaceId) return false;
    if (staff.role === 'INSTRUCTOR') return true;
    return capability === 'edit'
      ? staff.canEditContent
      : capability === 'grade'
        ? staff.canGrade
        : capability === 'manageLearners'
          ? staff.canManageLearners
          : false;
  }
}
