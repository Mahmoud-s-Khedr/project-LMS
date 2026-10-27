import {
  HttpException,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { etagOf } from './learning.support';

/** Personalized learning data is never cacheable; mutable aggregates expose an updatedAt-derived ETag. */
@Injectable()
export class LearningResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const response = context.switchToHttp().getResponse<Response>();
    response.setHeader('Cache-Control', 'private, no-store');
    return next.handle().pipe(
      catchError((error: unknown) => {
        const body = error instanceof HttpException ? error.getResponse() : undefined;
        if ((body as { code?: unknown } | undefined)?.code === 'OPERATION_IN_PROGRESS')
          response.setHeader('Retry-After', '2');
        return throwError(() => error);
      }),
      map((value: unknown) => {
        const data = (value as { data?: unknown } | null)?.data;
        const updatedAt = (data as { updatedAt?: unknown } | null)?.updatedAt;
        if (typeof updatedAt === 'string' && !Array.isArray(data))
          response.setHeader('ETag', etagOf(updatedAt));
        return value;
      }),
    );
  }
}
