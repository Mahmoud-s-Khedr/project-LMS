import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
  HttpException,
  ConflictException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { map, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
export const commerceEtag = (updatedAt: Date | string) => `"${new Date(updatedAt).getTime()}"`;
export function editTag(r: Request): string {
  const tag = r.headers['if-match'];
  if (typeof tag !== 'string' || !/^"[0-9]+"$/.test(tag))
    throw new HttpException({ code: 'PRECONDITION_REQUIRED', message: 'If-Match required' }, 428);
  return tag;
}
export function assertEtag(updatedAt: Date, expected?: string) {
  if (expected && commerceEtag(updatedAt) !== expected)
    throw new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'Resource changed; reload before editing',
    });
}
@Injectable()
export class CommerceResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'private, no-store');
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpException) {
          const body = error.getResponse();
          if (
            typeof body === 'object' &&
            body &&
            'code' in body &&
            body.code === 'OPERATION_IN_PROGRESS'
          )
            response.setHeader('Retry-After', '2');
        }
        return throwError(() => error);
      }),
      map((value: unknown) => {
        if (value && typeof value === 'object' && 'data' in value) {
          const data = value.data;
          if (
            data &&
            typeof data === 'object' &&
            'updatedAt' in data &&
            typeof data.updatedAt === 'string'
          )
            response.setHeader('ETag', commerceEtag(data.updatedAt));
        }
        return value;
      }),
    );
  }
}
