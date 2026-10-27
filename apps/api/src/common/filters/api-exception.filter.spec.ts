import { type ArgumentsHost, BadRequestException, ForbiddenException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { apiErrorSchema } from '@lms/shared';
import { ApiExceptionFilter } from './api-exception.filter';

function createHost(path = '/api/v1/test', requestId = 'req-123') {
  const response = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
  };
  const request = { id: requestId, path };
  const host = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
  return { host, response };
}

describe('ApiExceptionFilter', () => {
  const logger = { error: jest.fn() } as unknown as PinoLogger;
  const filter = new ApiExceptionFilter(logger);

  it('converts class-validator string[] messages into structured validation detail rows', () => {
    const { host, response } = createHost();
    filter.catch(new BadRequestException(['email must be an email']), host);
    expect(response.status).toHaveBeenCalledWith(400);
    const body = response.json.mock.calls[0]?.[0];
    expect(apiErrorSchema.parse(body)).toMatchObject({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: [{ path: '', code: 'invalid_input', message: 'email must be an email' }],
      },
    });
  });

  it('preserves canonical lock details and strips unrecognized raw details', () => {
    const { host: hostLock, response: resLock } = createHost();
    filter.catch(
      new ForbiddenException({
        code: 'CONTENT_LOCKED',
        message: 'Lesson locked',
        details: { reason: 'Prerequisite unmet', unlockAt: '2026-10-27T00:00:00Z' },
      }),
      hostLock,
    );
    expect(apiErrorSchema.parse(resLock.json.mock.calls[0]?.[0])).toMatchObject({
      error: {
        code: 'CONTENT_LOCKED',
        details: { reason: 'Prerequisite unmet', unlockAt: '2026-10-27T00:00:00Z' },
      },
    });

    const { host: hostRaw, response: resRaw } = createHost();
    filter.catch(
      new BadRequestException({
        code: 'BAD_REQUEST',
        message: 'Bad input',
        details: { internalStack: 'secret' },
      }),
      hostRaw,
    );
    const parsedRaw = apiErrorSchema.parse(resRaw.json.mock.calls[0]?.[0]);
    expect(parsedRaw.error.details).toBeUndefined();
  });
});
