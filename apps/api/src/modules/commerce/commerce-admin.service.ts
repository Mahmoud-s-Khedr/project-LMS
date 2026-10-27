import { Inject, Injectable, NotFoundException, Optional, ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { assertEtag } from './commerce-http';
import { PAYMENT_PROVIDER, type PaymentProvider } from './payment-provider';
import { Prisma } from '@prisma/client';
import type {
  ProductCreate,
  ProductUpdate,
  PriceCreate,
  CouponCreate,
  CouponUpdate,
  ProductsQuery,
  CouponsQuery,
} from '@lms/shared';
import { productSchema, priceSchema, couponSchema, idempotencyKeySchema } from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { PolicyService } from '../../common/authz/policy.service';
import type { AuthenticatedUser } from '../../common/authz/auth.types';
import { AuditService } from '../audit/audit.service';
import { hash, invalid, json, lock, page, pageArgs, type Tx } from './commerce.core';

export const productInclude = { productCourses: true } satisfies Prisma.ProductInclude;
export type ProductRow = Prisma.ProductGetPayload<{ include: typeof productInclude }>;
// Explicit projections ensure private provider mappings never escape.
export function productProjection(p: ProductRow) {
  return productSchema.parse({
    id: p.id,
    workspaceId: p.workspaceId,
    type: p.type,
    status: p.status,
    slug: p.slug,
    name: p.name,
    description: p.description,
    accessDurationDays: p.accessDurationDays,
    courseIds: p.productCourses.map((c) => c.courseId),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  });
}
export function priceProjection(p: Prisma.PriceGetPayload<object>) {
  return priceSchema.parse({
    id: p.id,
    workspaceId: p.workspaceId,
    productId: p.productId,
    currency: p.currency,
    amount: p.amount,
    interval: p.interval,
    intervalCount: p.intervalCount,
    trialDays: p.trialDays,
    isActive: p.isActive,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  });
}
const couponInclude = {
  couponProducts: true,
} satisfies Prisma.CouponInclude;
function couponProjection(
  c: Prisma.CouponGetPayload<{ include: typeof couponInclude }>,
  reservedUses: number,
  redeemedUses: number,
) {
  return couponSchema.parse({
    id: c.id,
    workspaceId: c.workspaceId,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    productIds: c.couponProducts.map((p) => p.productId),
    reservedUses,
    redeemedUses,
    rules: {
      code: c.code,
      kind: c.kind,
      ...(c.kind === 'FIXED'
        ? { amountOff: c.amountOff, currency: c.currency }
        : { percentOff: c.percentOff?.toString() }),
      validFrom: c.validFrom.toISOString(),
      validUntil: c.validUntil?.toISOString() ?? null,
      maxRedemptions: c.maxRedemptions,
      maxPerUser: c.maxPerUser,
      minimumOrderAmount: c.minimumOrderAmount,
      isActive: c.isActive,
    },
  });
}
@Injectable()
export class CommerceAdminService {
  constructor(
    private readonly db: PrismaService,
    private readonly policy: PolicyService,
    private readonly audit: AuditService,
    @Optional() @Inject(PAYMENT_PROVIDER) private readonly provider?: PaymentProvider,
  ) {}
  private async projectCoupon(
    tx: Pick<Tx, 'couponRedemption'>,
    c: Prisma.CouponGetPayload<{ include: typeof couponInclude }>,
  ) {
    const reserved = await tx.couponRedemption.count({
      where: {
        workspaceId: c.workspaceId,
        couponId: c.id,
        releasedAt: null,
        redeemedAt: null,
        reservedUntil: { gt: new Date() },
      },
    });
    const redeemed = await tx.couponRedemption.count({
      where: { workspaceId: c.workspaceId, couponId: c.id, redeemedAt: { not: null } },
    });
    return couponProjection(c, reserved, redeemed);
  }
  async authorize(actor: AuthenticatedUser, workspaceId: string) {
    if (!(await this.policy.hasWorkspaceRole(actor, workspaceId, ['ADMIN'])))
      throw new NotFoundException();
  }
  async change<T>(
    actor: AuthenticatedUser,
    w: string,
    requestId: string,
    resource: string,
    id: string,
    run: (tx: Tx) => Promise<T>,
    expected?: string,
  ): Promise<T> {
    await this.authorize(actor, w);
    return this.db
      .$transaction(
        async (tx) => {
          await lock(tx, `commerce:${w}`);
          // Recheck membership in the transaction; coordinate workspace mutations through its canonical row lock.
          await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id"=${w}::uuid FOR UPDATE`;
          const workspace = await tx.workspace.findFirst({
            where: { id: w, status: 'ACTIVE', deletedAt: null },
          });
          const member =
            actor.platformRole === 'SUPER_ADMIN' ||
            (await tx.workspaceMember.findFirst({
              where: {
                workspaceId: w,
                userId: actor.id,
                status: 'ACTIVE',
                role: 'ADMIN',
                deletedAt: null,
              },
            }));
          if (!workspace || !member) throw new NotFoundException();
          if (expected) {
            const row =
              resource === 'product'
                ? await tx.product.findFirst({ where: { id, workspaceId: w } })
                : resource === 'price'
                  ? await tx.price.findFirst({ where: { id, workspaceId: w } })
                  : await tx.coupon.findFirst({ where: { id, workspaceId: w } });
            if (!row) throw new NotFoundException();
            assertEtag(row.updatedAt, expected);
          }
          const result = await run(tx);
          const projection =
            result && typeof result === 'object' && 'data' in result ? result.data : null;
          const auditResourceId =
            projection &&
            typeof projection === 'object' &&
            'id' in projection &&
            typeof projection.id === 'string'
              ? projection.id
              : id;
          await this.audit.append(tx, {
            workspaceId: w,
            actorId: actor.id,
            requestId,
            action: `commerce.${resource}.changed`,
            resourceType: resource,
            resourceId: auditResourceId,
            changes: { fields: ['configuration'] },
          });
          return result;
        },
        { timeout: 60000 },
      )
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError) {
          if (error.code === 'P2002') throw new ConflictException('Resource already exists');
          if (error.code === 'P2003') invalid('Invalid resource reference');
        }
        throw error;
      });
  }
  async courses(tx: Tx, w: string, ids: string[], type: string) {
    if (type === 'COURSE' && ids.length !== 1) invalid('COURSE requires exactly one course');
    if (
      (await tx.course.count({ where: { id: { in: ids }, workspaceId: w, deletedAt: null } })) !==
      ids.length
    )
      invalid('Invalid course membership');
  }
  async product(actor: AuthenticatedUser, workspaceId: string, id: string) {
    await this.authorize(actor, workspaceId);
    const row = await this.db.product.findFirst({
      where: { id, workspaceId, deletedAt: null },
      include: productInclude,
    });
    if (!row) throw new NotFoundException();
    return { data: productProjection(row) };
  }
  async products(actor: AuthenticatedUser, w: string, q: ProductsQuery) {
    await this.authorize(actor, w);
    const scope = { w, ...q, cursor: undefined };
    const args = pageArgs(q, scope);
    const rows = await this.db.product.findMany({
      ...args,
      where: {
        ...args.where,
        workspaceId: w,
        deletedAt: null,
        ...(q.status ? { status: q.status } : {}),
        ...(q.type ? { type: q.type } : {}),
        ...(q.search ? { name: { contains: q.search, mode: 'insensitive' } } : {}),
      },
      include: productInclude,
    });
    return page(rows, q.limit, scope, productProjection);
  }
  createProduct(a: AuthenticatedUser, w: string, input: ProductCreate, r: string) {
    return this.change(a, w, r, 'product', w, async (tx) => {
      await this.courses(tx, w, input.courseIds, input.type);
      const { courseIds, ...data } = input;
      const p = await tx.product.create({
        data: {
          ...data,
          description: json(data.description),
          workspaceId: w,
          productCourses: {
            create: courseIds.map((courseId, position) => ({ courseId, position })),
          },
        },
        include: productInclude,
      });
      return { data: productProjection(p) };
    });
  }
  updateProduct(
    a: AuthenticatedUser,
    w: string,
    id: string,
    input: ProductUpdate,
    r: string,
    expected?: string,
  ) {
    return this.change(
      a,
      w,
      r,
      'product',
      id,
      async (tx) => {
        const p = await tx.product.findFirst({
          where: { id, workspaceId: w, deletedAt: null },
          include: { productCourses: { include: { course: true } } },
        });
        if (!p) throw new NotFoundException();
        if (
          input.status === 'ACTIVE' &&
          p.productCourses.some(
            (c) =>
              c.course.status !== 'PUBLISHED' ||
              c.course.deletedAt ||
              c.course.visibility === 'PRIVATE',
          )
        )
          invalid('Only published sellable courses can be activated');
        return {
          data: productProjection(
            await tx.product.update({
              where: { id },
              data: {
                ...input,
                updatedAt: new Date(Math.max(Date.now(), p.updatedAt.getTime() + 1)),
                ...(input.description ? { description: json(input.description) } : {}),
              },
              include: productInclude,
            }),
          ),
        };
      },
      expected,
    );
  }
  replaceCourses(
    a: AuthenticatedUser,
    w: string,
    id: string,
    ids: string[],
    r: string,
    expected?: string,
  ) {
    return this.change(
      a,
      w,
      r,
      'product',
      id,
      async (tx) => {
        const p = await tx.product.findFirst({ where: { id, workspaceId: w, deletedAt: null } });
        if (!p) throw new NotFoundException();
        await this.courses(tx, w, ids, p.type);
        if (
          p.status === 'ACTIVE' &&
          (await tx.course.count({
            where: {
              id: { in: ids },
              workspaceId: w,
              status: 'PUBLISHED',
              visibility: { not: 'PRIVATE' },
              deletedAt: null,
            },
          })) !== ids.length
        )
          invalid('Courses not sellable');
        await tx.productCourse.deleteMany({ where: { workspaceId: w, productId: id } });
        await tx.productCourse.createMany({
          data: ids.map((courseId, position) => ({
            workspaceId: w,
            productId: id,
            courseId,
            position,
          })),
        });
        await tx.product.update({
          where: { id },
          data: { updatedAt: new Date(Math.max(Date.now(), p.updatedAt.getTime() + 1)) },
        });
        return {
          data: productProjection(
            await tx.product.findUniqueOrThrow({ where: { id }, include: productInclude }),
          ),
        };
      },
      expected,
    );
  }
  async createPrice(
    a: AuthenticatedUser,
    w: string,
    id: string,
    input: PriceCreate,
    r: string,
    key?: string,
  ) {
    if (key !== undefined && !idempotencyKeySchema.safeParse(key).success)
      invalid('Idempotency-Key must be 16..128 characters');
    const digest = hash({ w, userId: a.id, productId: id, key });
    const priceId = key
      ? `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`
      : randomUUID();
    const intent = await this.change(a, w, r, 'price', id, async (tx) => {
      const p = await tx.product.findFirst({ where: { id, workspaceId: w, deletedAt: null } });
      if (!p) throw new NotFoundException();
      if ((p.type === 'SUBSCRIPTION_PLAN') !== (input.interval !== null))
        invalid('Price interval does not match product');
      if (!supportedCurrency(input.currency)) invalid('Unsupported currency');
      if (input.interval === 'YEAR' && input.intervalCount > 3)
        invalid('Billing interval exceeds three years');
      const existing = await tx.price.findUnique({ where: { id: priceId } });
      if (existing) {
        if (
          existing.productId !== id ||
          existing.workspaceId !== w ||
          existing.currency !== input.currency ||
          existing.amount !== input.amount ||
          existing.interval !== input.interval ||
          existing.intervalCount !== input.intervalCount ||
          existing.trialDays !== input.trialDays
        )
          throw new ConflictException('Idempotency key already used for a different price');
        return { price: existing, product: p };
      }
      const price = await tx.price.create({
        data: {
          id: priceId,
          ...input,
          isActive: this.provider?.enabled ? false : input.isActive,
          workspaceId: w,
          productId: id,
        },
      });
      return { price, product: p };
    });
    if (!this.provider?.enabled || intent.price.stripePriceId)
      return { data: priceProjection(intent.price) };
    const remoteProduct =
      intent.product.stripeProductId ??
      (
        await this.provider.call(
          'products',
          'create',
          { name: intent.product.name },
          `product-${id}`,
        )
      ).id;
    await this.change(a, w, r, 'product', id, async (tx) => {
      await tx.product.updateMany({
        where: { id, workspaceId: w, stripeProductId: null },
        data: { stripeProductId: remoteProduct },
      });
    });
    const remote = await this.provider.call(
      'prices',
      'create',
      {
        product: remoteProduct,
        currency: input.currency,
        unit_amount: input.amount,
        ...(input.interval
          ? {
              recurring: {
                interval: input.interval.toLowerCase(),
                interval_count: input.intervalCount,
              },
            }
          : {}),
      },
      `price-${priceId}`,
    );
    return this.change(a, w, r, 'price', priceId, async (tx) => {
      const price = await tx.price.findFirstOrThrow({
        where: { id: priceId, workspaceId: w, productId: id },
      });
      if (price.stripePriceId) return { data: priceProjection(price) };
      return {
        data: priceProjection(
          await tx.price.update({
            where: { id: priceId },
            data: { stripePriceId: remote.id, isActive: input.isActive },
          }),
        ),
      };
    });
  }
  updatePrice(
    a: AuthenticatedUser,
    w: string,
    p: string,
    id: string,
    isActive: boolean,
    r: string,
    expected?: string,
  ) {
    return this.change(
      a,
      w,
      r,
      'price',
      id,
      async (tx) => {
        if (!(await tx.price.findFirst({ where: { id, workspaceId: w, productId: p } })))
          throw new NotFoundException();
        return {
          data: priceProjection(await tx.price.update({ where: { id }, data: { isActive } })),
        };
      },
      expected,
    );
  }
  async coupons(a: AuthenticatedUser, w: string, q: CouponsQuery) {
    await this.authorize(a, w);
    const scope = { w, ...q, cursor: undefined };
    const args = pageArgs(q, scope);
    const rows = await this.db.coupon.findMany({
      ...args,
      where: {
        ...args.where,
        workspaceId: w,
        deletedAt: null,
        ...(q.search ? { code: { contains: q.search.toUpperCase() } } : {}),
        ...(q.isActive ? { isActive: q.isActive === 'true' } : {}),
        ...(q.from || q.to
          ? {
              createdAt: {
                ...(q.from ? { gte: new Date(q.from) } : {}),
                ...(q.to ? { lt: new Date(q.to) } : {}),
              },
            }
          : {}),
      },
      include: couponInclude,
    });
    const result = page(rows, q.limit, scope, (c) => c.id);
    return {
      ...result,
      data: await Promise.all(rows.slice(0, q.limit).map((c) => this.projectCoupon(this.db, c))),
    };
  }
  createCoupon(a: AuthenticatedUser, w: string, input: CouponCreate, r: string) {
    return this.change(a, w, r, 'coupon', w, async (tx) => ({
      data: await this.projectCoupon(
        tx,
        await tx.coupon.create({
          data: {
            ...input,
            workspaceId: w,
            validFrom: new Date(input.validFrom),
            validUntil: input.validUntil ? new Date(input.validUntil) : null,
          },
          include: couponInclude,
        }),
      ),
    }));
  }
  updateCoupon(
    a: AuthenticatedUser,
    w: string,
    id: string,
    input: CouponUpdate,
    r: string,
    expected?: string,
  ) {
    return this.change(
      a,
      w,
      r,
      'coupon',
      id,
      async (tx) => {
        await lock(tx, `coupon:${id}`);
        const c = await tx.coupon.findFirst({ where: { id, workspaceId: w, deletedAt: null } });
        if (!c) throw new NotFoundException();
        const from = input.validFrom ? new Date(input.validFrom) : c.validFrom;
        const until =
          input.validUntil === null
            ? null
            : input.validUntil
              ? new Date(input.validUntil)
              : c.validUntil;
        if (until && until <= from) invalid('Invalid validity window');
        return {
          data: await this.projectCoupon(
            tx,
            await tx.coupon.update({
              where: { id },
              data: {
                ...input,
                validFrom: from,
                validUntil: until,
                updatedAt: new Date(Math.max(Date.now(), c.updatedAt.getTime() + 1)),
              },
              include: couponInclude,
            }),
          ),
        };
      },
      expected,
    );
  }
  replaceCouponProducts(
    a: AuthenticatedUser,
    w: string,
    id: string,
    ids: string[],
    r: string,
    expected?: string,
  ) {
    return this.change(
      a,
      w,
      r,
      'coupon',
      id,
      async (tx) => {
        await lock(tx, `coupon:${id}`);
        if (!(await tx.coupon.findFirst({ where: { id, workspaceId: w, deletedAt: null } })))
          throw new NotFoundException();
        if (
          (await tx.product.count({
            where: { id: { in: ids }, workspaceId: w, deletedAt: null },
          })) !== ids.length
        )
          invalid('Invalid product scope');
        await tx.couponProduct.deleteMany({ where: { workspaceId: w, couponId: id } });
        await tx.couponProduct.createMany({
          data: ids.map((productId) => ({ workspaceId: w, couponId: id, productId })),
        });
        await tx.coupon.update({ where: { id }, data: { updatedAt: new Date() } });
        return {
          data: await this.projectCoupon(
            tx,
            await tx.coupon.findUniqueOrThrow({ where: { id }, include: couponInclude }),
          ),
        };
      },
      expected,
    );
  }
}
export function supportedCurrency(currency: string) {
  return (process.env.COMMERCE_CURRENCIES ?? 'usd,eur,gbp,egp').split(',').includes(currency);
}
