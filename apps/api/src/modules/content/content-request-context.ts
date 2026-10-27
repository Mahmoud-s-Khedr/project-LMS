import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';
import type { Request } from 'express';
/** Preserves the HTTP correlation ID across transactional queries without trusting arbitrary headers. */
@Injectable()
export class ContentRequestContext {
  private readonly storage = new AsyncLocalStorage<string>();
  id() {
    return this.storage.getStore() ?? randomUUID();
  }
  run<T>(id: string, fn: () => T): T {
    return this.storage.run(id, fn);
  }
}
@Injectable()
export class ContentRequestInterceptor implements NestInterceptor {
  constructor(private readonly context: ContentRequestContext) {}
  intercept(execution: ExecutionContext, next: CallHandler) {
    const request = execution.switchToHttp().getRequest<Request>();
    const id =
      typeof request.id === 'string' && request.id.length > 0 && request.id.length <= 100
        ? request.id
        : randomUUID();
    return new Observable((subscriber) =>
      this.context.run(id, () => next.handle().subscribe(subscriber)),
    );
  }
}
