import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Req,
  BadRequestException,
  UseInterceptors,
  UseGuards,
  type RawBodyRequest,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import * as C from '@lms/shared';
import { CurrentUser, Public } from '../../common/authz/decorators';
import type { AuthenticatedUser } from '../../common/authz/auth.types';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { SchemaBody, SchemaResponse, SchemaQuery } from '../auth/schema.decorator';
import { CommerceResponseInterceptor, editTag } from './commerce-http';
import { CommerceAdminService } from './commerce-admin.service';
import { CheckoutService } from './checkout.service';
import { BillingService } from './billing.service';
import { CommerceWorkerService } from './commerce-worker.service';
import { CommerceCatalogService } from './commerce-catalog.service';
const pipe = <T extends z.ZodType>(s: T) => new ZodValidationPipe(s);
const requestId = (r: Request) =>
  typeof r.headers['x-request-id'] === 'string'
    ? r.headers['x-request-id'].slice(0, 100)
    : 'commerce-http';
@UseInterceptors(CommerceResponseInterceptor)
@ApiTags('Commerce')
@ApiBearerAuth()
@Controller('workspaces/:workspaceId')
export class CommerceController {
  constructor(
    private readonly admin: CommerceAdminService,
    private readonly checkout: CheckoutService,
    private readonly billing: BillingService,
  ) {}
  @Get('products')
  @SchemaQuery(C.productsQuerySchema)
  @SchemaResponse(C.productsResponseSchema)
  products(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Query(pipe(C.productsQuerySchema)) q: C.ProductsQuery,
  ) {
    return this.admin.products(a, w, q);
  }
  @Get('products/:productId')
  @SchemaResponse(C.productResponseSchema)
  getProduct(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('productId', ParseUUIDPipe) id: string,
  ) {
    return this.admin.product(a, w, id);
  }
  @Post('products')
  @SchemaBody(C.productCreateSchema)
  @SchemaResponse(C.productResponseSchema, 201)
  product(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Body(pipe(C.productCreateSchema)) b: C.ProductCreate,
    @Req() r: Request,
  ) {
    return this.admin.createProduct(a, w, b, requestId(r));
  }
  @Patch('products/:productId')
  @SchemaBody(C.productUpdateSchema)
  @SchemaResponse(C.productResponseSchema)
  updateProduct(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('productId', ParseUUIDPipe) id: string,
    @Body(pipe(C.productUpdateSchema)) b: C.ProductUpdate,
    @Req() r: Request,
  ) {
    return this.admin.updateProduct(a, w, id, b, requestId(r), editTag(r));
  }
  @Delete('products/:productId')
  @HttpCode(204)
  archive(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('productId', ParseUUIDPipe) id: string,
    @Req() r: Request,
  ) {
    return this.admin
      .updateProduct(a, w, id, { status: 'ARCHIVED' }, requestId(r), editTag(r))
      .then(() => undefined);
  }
  @Put('products/:productId/courses')
  @SchemaBody(C.productCoursesReplaceSchema)
  @SchemaResponse(C.productResponseSchema)
  courses(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('productId', ParseUUIDPipe) id: string,
    @Body(pipe(C.productCoursesReplaceSchema)) b: z.infer<typeof C.productCoursesReplaceSchema>,
    @Req() r: Request,
  ) {
    return this.admin.replaceCourses(a, w, id, b.courseIds, requestId(r), editTag(r));
  }
  @Post('products/:productId/prices')
  @SchemaBody(C.priceCreateSchema)
  @SchemaResponse(C.priceResponseSchema, 201)
  price(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('productId', ParseUUIDPipe) id: string,
    @Body(pipe(C.priceCreateSchema)) b: C.PriceCreate,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: Request,
  ) {
    return this.admin.createPrice(a, w, id, b, requestId(r), k);
  }
  @Patch('products/:productId/prices/:priceId')
  @SchemaBody(C.priceUpdateSchema)
  @SchemaResponse(C.priceResponseSchema)
  updatePrice(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('productId', ParseUUIDPipe) p: string,
    @Param('priceId', ParseUUIDPipe) id: string,
    @Body(pipe(C.priceUpdateSchema)) b: C.PriceUpdate,
    @Req() r: Request,
  ) {
    return this.admin.updatePrice(a, w, p, id, b.isActive, requestId(r), editTag(r));
  }
  @Get('coupons')
  @SchemaQuery(C.couponsQuerySchema)
  @SchemaResponse(C.couponsResponseSchema)
  coupons(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Query(pipe(C.couponsQuerySchema)) q: C.CouponsQuery,
  ) {
    return this.admin.coupons(a, w, q);
  }
  @Post('coupons')
  @SchemaBody(C.couponCreateSchema)
  @SchemaResponse(C.couponResponseSchema, 201)
  coupon(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Body(pipe(C.couponCreateSchema)) b: C.CouponCreate,
    @Req() r: Request,
  ) {
    return this.admin.createCoupon(a, w, b, requestId(r));
  }
  @Patch('coupons/:couponId')
  @SchemaBody(C.couponUpdateSchema)
  @SchemaResponse(C.couponResponseSchema)
  updateCoupon(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('couponId', ParseUUIDPipe) id: string,
    @Body(pipe(C.couponUpdateSchema)) b: C.CouponUpdate,
    @Req() r: Request,
  ) {
    return this.admin.updateCoupon(a, w, id, b, requestId(r), editTag(r));
  }
  @Put('coupons/:couponId/products')
  @SchemaBody(C.couponProductsReplaceSchema)
  @SchemaResponse(C.couponResponseSchema)
  couponProducts(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('couponId', ParseUUIDPipe) id: string,
    @Body(pipe(C.couponProductsReplaceSchema)) b: z.infer<typeof C.couponProductsReplaceSchema>,
    @Req() r: Request,
  ) {
    return this.admin.replaceCouponProducts(a, w, id, b.productIds, requestId(r), editTag(r));
  }
  @Delete('coupons/:couponId')
  @HttpCode(204)
  archiveCoupon(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('couponId', ParseUUIDPipe) id: string,
    @Req() r: Request,
  ) {
    return this.admin
      .updateCoupon(a, w, id, { isActive: false }, requestId(r), editTag(r))
      .then(() => undefined);
  }
  @Post('checkout/quote')
  @HttpCode(200)
  @SchemaBody(C.checkoutQuoteInputSchema)
  @SchemaResponse(C.checkoutQuoteResponseSchema)
  quote(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Body(pipe(C.checkoutQuoteInputSchema)) b: C.CheckoutQuoteInput,
  ) {
    return this.checkout.quote(a, w, b);
  }
  @Post('checkout/sessions')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @SchemaBody(C.checkoutSessionInputSchema)
  @SchemaResponse(C.checkoutSessionResponseSchema, 201)
  session(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Body(pipe(C.checkoutSessionInputSchema)) b: C.CheckoutSessionInput,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: Request,
  ) {
    return this.checkout.session(a, w, b, k, requestId(r));
  }
  @Get('orders')
  @SchemaQuery(C.ordersQuerySchema)
  @SchemaResponse(C.ordersResponseSchema)
  orders(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Query(pipe(C.ordersQuerySchema)) q: C.OrdersQuery,
  ) {
    return this.billing.orders(a, q, w);
  }
  @Get('orders/:orderId')
  @SchemaResponse(C.orderResponseSchema)
  order(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('orderId', ParseUUIDPipe) id: string,
  ) {
    return this.billing.order(a, id, w);
  }
  @Post('orders/:orderId/cancel')
  @HttpCode(200)
  @SchemaBody(C.emptyInputSchema)
  @SchemaResponse(C.orderResponseSchema)
  cancelOrder(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('orderId', ParseUUIDPipe) id: string,
    @Body(pipe(C.emptyInputSchema)) _b: object,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: Request,
  ) {
    return this.billing.cancelOrder(a, w, id, k, requestId(r));
  }
  @Post('payments/:paymentId/refunds')
  @HttpCode(202)
  @SchemaBody(C.refundInputSchema)
  @SchemaResponse(C.refundAcceptedResponseSchema, 202)
  refund(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('paymentId', ParseUUIDPipe) id: string,
    @Body(pipe(C.refundInputSchema)) b: C.RefundInput,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: Request,
  ) {
    return this.billing.refund(a, w, id, b, k, requestId(r));
  }
  @Get('refunds/:refundId')
  @SchemaResponse(C.refundResponseSchema)
  getRefund(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('refundId', ParseUUIDPipe) id: string,
  ) {
    return this.billing.getRefund(a, w, id);
  }
  @Post('subscriptions/:subscriptionId/cancel')
  @HttpCode(200)
  @SchemaBody(C.adminSubscriptionCancelSchema)
  @SchemaResponse(C.subscriptionResponseSchema)
  cancelSubscription(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Param('subscriptionId', ParseUUIDPipe) id: string,
    @Body(pipe(C.adminSubscriptionCancelSchema)) b: C.AdminSubscriptionCancel,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: Request,
  ) {
    return this.billing.changeSubscription(a, id, k, requestId(r), b, w);
  }
  @Post('billing/portal-sessions')
  @SchemaBody(C.billingPortalInputSchema)
  @SchemaResponse(C.billingPortalResponseSchema, 201)
  portal(
    @CurrentUser() a: AuthenticatedUser,
    @Param('workspaceId', ParseUUIDPipe) w: string,
    @Body(pipe(C.billingPortalInputSchema)) b: C.BillingPortalInput,
  ) {
    return this.billing.portal(a, w, b.returnPath);
  }
}
@UseInterceptors(CommerceResponseInterceptor)
@ApiTags('Commerce self service')
@ApiBearerAuth()
@Controller('me')
export class CommerceSelfController {
  constructor(private readonly billing: BillingService) {}
  @Get('orders')
  @SchemaQuery(C.ordersQuerySchema)
  @SchemaResponse(C.ordersResponseSchema)
  orders(@CurrentUser() a: AuthenticatedUser, @Query(pipe(C.ordersQuerySchema)) q: C.OrdersQuery) {
    return this.billing.orders(a, q);
  }
  @Get('orders/:orderId')
  @SchemaResponse(C.orderResponseSchema)
  order(@CurrentUser() a: AuthenticatedUser, @Param('orderId', ParseUUIDPipe) id: string) {
    return this.billing.order(a, id);
  }
  @Get('subscriptions')
  @SchemaQuery(C.subscriptionsQuerySchema)
  @SchemaResponse(C.subscriptionsResponseSchema)
  subscriptions(
    @CurrentUser() a: AuthenticatedUser,
    @Query(pipe(C.subscriptionsQuerySchema)) q: C.SubscriptionsQuery,
  ) {
    return this.billing.subscriptions(a, q);
  }
  @Get('subscriptions/:subscriptionId')
  @SchemaResponse(C.subscriptionResponseSchema)
  subscription(
    @CurrentUser() a: AuthenticatedUser,
    @Param('subscriptionId', ParseUUIDPipe) id: string,
  ) {
    return this.billing.subscription(a, id);
  }
  @Post('subscriptions/:subscriptionId/cancel')
  @HttpCode(200)
  @SchemaBody(C.subscriptionCancelSchema)
  @SchemaResponse(C.subscriptionResponseSchema)
  cancel(
    @CurrentUser() a: AuthenticatedUser,
    @Param('subscriptionId', ParseUUIDPipe) id: string,
    @Body(pipe(C.subscriptionCancelSchema)) _b: object,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: Request,
  ) {
    return this.billing.changeSubscription(a, id, k, requestId(r), {});
  }
  @Post('subscriptions/:subscriptionId/resume')
  @HttpCode(200)
  @SchemaBody(C.emptyInputSchema)
  @SchemaResponse(C.subscriptionResponseSchema)
  resume(
    @CurrentUser() a: AuthenticatedUser,
    @Param('subscriptionId', ParseUUIDPipe) id: string,
    @Body(pipe(C.emptyInputSchema)) _b: object,
    @Headers('idempotency-key') k: string | undefined,
    @Req() r: Request,
  ) {
    return this.billing.changeSubscription(a, id, k, requestId(r), { resume: true });
  }
}
@ApiTags('Commerce catalog')
@Public()
@Controller('catalog/products')
export class CommercePublicController {
  constructor(private readonly catalog: CommerceCatalogService) {}
  @Get()
  @SchemaQuery(C.catalogProductsQuerySchema)
  @SchemaResponse(C.publicProductsResponseSchema)
  list(@Query(pipe(C.catalogProductsQuerySchema)) q: z.infer<typeof C.catalogProductsQuerySchema>) {
    return this.catalog.list(q);
  }
  @Get(':productId')
  @SchemaResponse(C.publicProductResponseSchema)
  detail(@Param('productId', ParseUUIDPipe) id: string) {
    return this.catalog.detail(id);
  }
}
@ApiTags('Stripe webhook')
@Public()
@Controller('webhooks/stripe')
export class StripeWebhookController {
  constructor(private readonly worker: CommerceWorkerService) {}
  @Post()
  @HttpCode(200)
  accept(
    @Req() r: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    if (!r.rawBody || !signature)
      throw new BadRequestException('Raw body and Stripe signature required');
    return this.worker.accept(r.rawBody, signature);
  }
}
