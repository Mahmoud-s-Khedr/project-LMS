import { Injectable } from '@nestjs/common';
import {
  domainEventSchema,
  eventPayloadSchemas,
  isGlobalScopeEventType,
  type DomainEvent,
  type EventType,
} from '@lms/shared';

export interface EnvelopeCandidate {
  readonly id: string;
  readonly workspaceId: string | null;
  readonly type: string;
  readonly schemaVersion: number;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly sequence: string;
  readonly timestamp: string;
  readonly payload: unknown;
}

export type EnvelopeValidation =
  | { readonly ok: true; readonly event: DomainEvent }
  | { readonly ok: false; readonly issues: readonly string[] };

/**
 * Narrow port onto the shared versioned event contracts (`@lms/shared` events). The bus never interprets
 * payload meaning; it only enforces type allowlist, scope rule and payload schema.
 */
export interface EventContracts {
  isKnownType(type: string): boolean;
  /** True when the type is an allowlisted global identity/security type that MUST have null workspace. */
  isGlobalScope(type: string): boolean;
  /** Schema version encoded by the `.vN` suffix. */
  schemaVersionOf(type: string): number;
  /** Validates a full envelope (type, scope rule, strict payload, aggregate id, serialization). */
  validateEnvelope(candidate: EnvelopeCandidate): EnvelopeValidation;
  /** Every known event type (used to validate consumer subscriptions). */
  knownTypes(): readonly string[];
}

export function schemaVersionFromType(type: string): number {
  const match = /\.v([1-9][0-9]*)$/.exec(type);
  if (!match?.[1]) throw new Error(`Event type ${type} has no .vN version suffix`);
  return Number(match[1]);
}

/** Default contracts backed by `@lms/shared` (P1-C). */
@Injectable()
export class SharedEventContracts implements EventContracts {
  private readonly types = new Set<string>(Object.keys(eventPayloadSchemas));

  isKnownType(type: string): type is EventType {
    return this.types.has(type);
  }

  isGlobalScope(type: string): boolean {
    return isGlobalScopeEventType(type);
  }

  schemaVersionOf(type: string): number {
    return schemaVersionFromType(type);
  }

  validateEnvelope(candidate: EnvelopeCandidate): EnvelopeValidation {
    const result = domainEventSchema.safeParse(candidate);
    if (result.success) return { ok: true, event: result.data };
    return {
      ok: false,
      issues: result.error.issues.map((issue) => `${issue.path.join('.') || '$'}: ${issue.message}`),
    };
  }

  knownTypes(): readonly string[] {
    return [...this.types];
  }
}
