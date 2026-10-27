import { randomUUID } from 'node:crypto';
import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Injectable,
  type ExceptionFilter,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import type { Request, Response } from 'express';
import { apiErrorSchema, type ApiErrorEnvelope } from '@lms/shared';

const statusCodes: Record<number, string> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHORIZED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

@Catch()
@Injectable()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request & { id?: string }>();
    const response = context.getResponse<Response>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload: unknown =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const body =
      typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
    const messages = Array.isArray(body.message) ? body.message : undefined;
    const isInternal = status >= 500 && status !== 503;
    const message = isInternal
      ? 'An unexpected error occurred'
      : typeof body.message === 'string'
        ? body.message
        : typeof payload === 'string'
          ? payload
          : messages
            ? 'Request validation failed'
            : 'Request failed';
    const requestId = request.id ?? randomUUID();
    const validationDetails = messages
      ?.filter((msg): msg is string => typeof msg === 'string')
      .slice(0, 100)
      .map((msg) => ({ path: '', code: 'invalid_input', message: msg }));
    const parsedDetails = apiErrorSchema.shape.error.shape.details.safeParse(
      body.details ?? validationDetails,
    );
    const parsedCode = apiErrorSchema.shape.error.shape.code.safeParse(body.code);
    const envelope: ApiErrorEnvelope = {
      error: {
        code: isInternal
          ? 'INTERNAL_ERROR'
          : parsedCode.success
            ? parsedCode.data
            : messages
              ? 'VALIDATION_FAILED'
              : (statusCodes[status] ?? 'HTTP_ERROR'),
        message,
        ...(!isInternal && parsedDetails.success && parsedDetails.data !== undefined
          ? { details: parsedDetails.data }
          : {}),
        requestId,
        timestamp: new Date().toISOString(),
        path: request.path,
      },
    };
    if (status >= 500) this.logger.error({ err: exception, requestId }, 'HTTP request failed');
    response.setHeader('x-request-id', requestId);
    response.status(status).json(envelope);
  }
}
