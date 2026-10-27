import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { z } from 'zod';

/** Use on a DTO parameter: @Body(new ZodValidationPipe(createCourseSchema)). */
@Injectable()
export class ZodValidationPipe<T extends z.ZodType> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.output<T> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: result.error.issues.map(({ path, message, code }) => ({
          path: path.join('.'),
          message,
          code,
        })),
      });
    }
    return result.data;
  }
}
