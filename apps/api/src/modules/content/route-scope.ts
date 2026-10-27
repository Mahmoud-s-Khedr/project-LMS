import { createParamDecorator, BadRequestException, type ExecutionContext } from '@nestjs/common';
import { uuidSchema } from '@lms/shared';
export const RouteIds = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Record<string, string> => {
    const params = ctx.switchToHttp().getRequest<{ params: Record<string, string> }>().params;
    for (const [key, value] of Object.entries(params))
      if (key.endsWith('Id') && !uuidSchema.safeParse(value).success)
        throw new BadRequestException('Invalid resource UUID');
    return params;
  },
);
export type CourseParams = {
  workspaceId: string;
  courseId: string;
  sectionId: string;
  lessonId: string;
  assetId: string;
  cohortId: string;
  sessionId: string;
  enrollmentId: string;
};
