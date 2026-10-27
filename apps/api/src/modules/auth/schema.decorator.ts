import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiResponse } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';

export const SchemaBody = (schema: z.ZodType) =>
  ApiBody({
    schema: z.toJSONSchema(schema, {
      io: 'input',
      target: 'openapi-3.0',
      unrepresentable: 'any',
    }) as SchemaObject,
  });
export const SchemaResponse = (schema: z.ZodType, status = 200) =>
  ApiResponse({
    status,
    schema: z.toJSONSchema(schema, {
      target: 'openapi-3.0',
      unrepresentable: 'any',
    }) as SchemaObject,
  });

export const SchemaQuery = (schema: z.ZodType) => {
  const json = z.toJSONSchema(schema, {
    io: 'input',
    target: 'openapi-3.0',
    unrepresentable: 'any',
  });
  return applyDecorators(
    ...Object.entries(json.properties ?? {}).map(([name, property]) =>
      ApiQuery({
        name,
        required: json.required?.includes(name) ?? false,
        schema: property as SchemaObject,
      }),
    ),
  );
};
