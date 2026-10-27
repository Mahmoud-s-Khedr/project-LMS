import {
  createParamDecorator,
  SetMetadata,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import type { Role } from '@prisma/client';
import type { AuthenticatedRequest, AuthenticatedUser } from './auth.types';

export const IS_PUBLIC = 'identity:public';
export const REQUIRED_ROLES = 'identity:roles';
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Platform scope only. For academy roles use PolicyService with the resolved workspaceId. */
export const Roles = (...roles: Role[]) => SetMetadata(REQUIRED_ROLES, roles);
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw new UnauthorizedException();
    return field ? user[field] : user;
  },
);
