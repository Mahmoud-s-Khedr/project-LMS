import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';

@Injectable()
export class IdentityEvents {
  private readonly logger = new Logger(IdentityEvents.name);
  constructor(private readonly emitter: EventEmitter2) {}
  async emit(type: string, payload: Record<string, string | null | boolean>): Promise<void> {
    try {
      await this.emitter.emitAsync(type, {
        eventId: randomUUID(),
        type,
        schemaVersion: 1,
        occurredAt: new Date().toISOString(),
        ...payload,
      });
    } catch {
      // Observers must not turn an already committed identity command into a failed request.
      this.logger.error(`Identity event subscriber failed: ${type}`);
    }
  }
}
