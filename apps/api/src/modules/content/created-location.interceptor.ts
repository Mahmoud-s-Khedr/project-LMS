import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { map } from 'rxjs/operators';
/** Canonical resource location for immediately persisted authoring resources and upload operations. */
@Injectable()
export class CreatedLocationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const response = context.switchToHttp().getResponse<Response>();
    const request = context.switchToHttp().getRequest<Request>();
    return next.handle().pipe(
      map((body: unknown) => {
        if (
          response.statusCode === 201 &&
          typeof body === 'object' &&
          body !== null &&
          'data' in body
        ) {
          const data = (body as { data: unknown }).data;
          if (typeof data === 'object' && data !== null) {
            const id = 'id' in data ? data.id : 'assetId' in data ? data.assetId : null;
            if (typeof id === 'string') {
              const base = request.path
                .replace(/\/sections\/[^/]+\/lessons$/, '/lessons')
                .replace(/\/lessons\/[^/]+\/live-sessions$/, '/live-sessions')
                .replace(/\/assets\/uploads$/, '/assets');
              response.setHeader('Location', `${base}/${encodeURIComponent(id)}`);
            }
          }
        }
        return body;
      }),
    );
  }
}
