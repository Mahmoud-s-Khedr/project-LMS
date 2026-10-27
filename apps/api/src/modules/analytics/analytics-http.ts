import {
  HttpException,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Response } from 'express';
import { catchError, throwError } from 'rxjs';
/** Shared NoStoreInterceptor handles privacy; this adds the API's required rate-limit retry hint. */
@Injectable()
export class AnalyticsRateLimitInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpException && error.getStatus() === 429)
          context.switchToHttp().getResponse<Response>().setHeader('Retry-After', '60');
        return throwError(() => error);
      }),
    );
  }
}
