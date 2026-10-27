import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { publicProductSchema, type catalogProductsQuerySchema } from '@lms/shared';
import type { z } from 'zod';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { pageArgs, page } from './commerce.core';
import { productProjection, priceProjection } from './commerce-admin.service';
const include = {
  prices: { where: { isActive: true } },
  productCourses: { include: { course: true } },
} satisfies Prisma.ProductInclude;
type Row = Prisma.ProductGetPayload<{ include: typeof include }>;
const sellable = {
  status: 'ACTIVE',
  deletedAt: null,
  workspace: { status: 'ACTIVE', deletedAt: null },
  productCourses: {
    some: {},
    every: { course: { status: 'PUBLISHED', visibility: 'PUBLIC', deletedAt: null } },
  },
} satisfies Prisma.ProductWhereInput;
function view(p: Row) {
  const {
    courseIds: _ids,
    createdAt: _created,
    updatedAt: _updated,
    ...product
  } = productProjection(p);
  return publicProductSchema.parse({
    ...product,
    prices: p.prices.map(priceProjection),
    courses: p.productCourses.map(({ course: c }) => ({
      id: c.id,
      workspaceId: c.workspaceId,
      slug: c.slug,
      title: c.title,
      summary: c.summary,
      description: c.description,
      status: c.status,
      visibility: c.visibility,
      deliveryMode: c.deliveryMode,
      language: c.language,
      level: c.level,
      isFree: c.isFree,
      estimatedMinutes: c.estimatedMinutes,
      publishedAt: c.publishedAt?.toISOString() ?? null,
      coverUrl: null,
    })),
  });
}
@Injectable()
export class CommerceCatalogService {
  constructor(private readonly db: PrismaService) {}
  async list(q: z.infer<typeof catalogProductsQuerySchema>) {
    const scope = { ...q, cursor: undefined };
    const args = pageArgs(q, scope);
    const rows = await this.db.product.findMany({
      ...args,
      where: {
        ...args.where,
        ...sellable,
        ...(q.workspaceId ? { workspaceId: q.workspaceId } : {}),
        ...(q.type ? { type: q.type } : {}),
      },
      include,
    });
    return page(rows, q.limit, scope, view);
  }
  async detail(id: string) {
    const p = await this.db.product.findFirst({ where: { id, ...sellable }, include });
    if (!p) throw new NotFoundException();
    return { data: view(p) };
  }
}
