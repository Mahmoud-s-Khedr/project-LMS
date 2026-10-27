import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(z.object({ page: z.coerce.number().int().positive() }));

  it('returns parsed data and rejects invalid input', () => {
    expect(pipe.transform({ page: '2' })).toEqual({ page: 2 });
    expect(() => pipe.transform({ page: '-1' })).toThrow(BadRequestException);
  });
});
