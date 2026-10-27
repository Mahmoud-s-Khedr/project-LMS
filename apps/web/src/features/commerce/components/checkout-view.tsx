'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ShieldCheck,
  Lock,
  ArrowRight,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { siteConfig } from '@/features/marketing/site-config';
import { useMeQuery } from '@/features/auth/hooks';
import type { PublicProduct, ProductPrice, PublicCourse } from '@/features/catalog';
import { useCheckoutQuoteQuery, useCreateCheckoutSessionMutation } from '../hooks';
import { formatMoney, formatInterval, generateIdempotencyKey } from '../utils';
import { CouponInput } from './coupon-input';

interface CourseWithCohorts extends PublicCourse {
  cohorts?: Array<{ id: string; name: string }>;
}

interface CheckoutViewProps {
  product: PublicProduct;
  initialPriceId?: string;
  workspaceId: string;
}

export function CheckoutView({ product, initialPriceId, workspaceId }: CheckoutViewProps) {
  const router = useRouter();
  const { data: me } = useMeQuery();

  // Price selection
  const activePrices = React.useMemo(
    () => product.prices.filter((p) => p.isActive),
    [product.prices],
  );
  const [selectedPriceId, setSelectedPriceId] = React.useState<string>(
    initialPriceId && activePrices.some((p) => p.id === initialPriceId)
      ? initialPriceId
      : (activePrices[0]?.id ?? product.prices[0]?.id ?? ''),
  );

  const selectedPrice: ProductPrice | undefined = React.useMemo(
    () => product.prices.find((p) => p.id === selectedPriceId) ?? activePrices[0],
    [product.prices, selectedPriceId, activePrices],
  );

  // Cohort selections: courseId -> cohortId (for courses that require a cohort)
  const cohortCourses = React.useMemo(() => {
    return ((product.courses || []) as CourseWithCohorts[]).filter(
      (c) => c.deliveryMode === 'COHORT' || Boolean(c.cohorts && c.cohorts.length > 0),
    );
  }, [product.courses]);

  const [cohortSelections, setCohortSelections] = React.useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const c of cohortCourses) {
      if (c.cohorts && c.cohorts.length > 0 && c.cohorts[0]) {
        initial[c.id] = c.cohorts[0].id;
      }
    }
    return initial;
  });

  // Coupon state
  const [couponInput, setCouponInput] = React.useState('');
  const [appliedCoupon, setAppliedCoupon] = React.useState<string | null>(null);
  const [couponError, setCouponError] = React.useState<string | null>(null);

  // Persistent Idempotency Key across submission attempts
  const idempotencyKeyRef = React.useRef<string>(generateIdempotencyKey('chk'));

  // Prepare quote payload
  const quoteInput = React.useMemo(() => {
    if (!selectedPriceId) return null;
    const cohortsList = Object.entries(cohortSelections)
      .filter(([courseId, cohortId]) => Boolean(courseId && cohortId))
      .map(([courseId, cohortId]) => ({ courseId, cohortId }));

    return {
      items: [
        {
          priceId: selectedPriceId,
          cohorts: cohortsList.length > 0 ? cohortsList : undefined,
        },
      ],
      couponCode: appliedCoupon ?? undefined,
    };
  }, [selectedPriceId, cohortSelections, appliedCoupon]);

  // Server-priced Quote Query
  const {
    data: quote,
    isLoading: isQuoteLoading,
    error: quoteQueryError,
  } = useCheckoutQuoteQuery(workspaceId, quoteInput);

  // React to quote errors when applying coupons
  React.useEffect(() => {
    if (quoteQueryError && appliedCoupon) {
      setCouponError(quoteQueryError.message || 'Coupon could not be applied');
      setAppliedCoupon(null);
    } else if (quote && appliedCoupon) {
      setCouponError(null);
    }
  }, [quoteQueryError, quote, appliedCoupon]);

  const handleApplyCoupon = (code: string) => {
    setCouponError(null);
    setAppliedCoupon(code);
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponInput('');
    setCouponError(null);
  };

  // Checkout Session Mutation
  const checkoutMutation = useCreateCheckoutSessionMutation(workspaceId);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Check if cohort selections are missing
  const missingCohortSelection = React.useMemo(() => {
    for (const c of cohortCourses) {
      if (!cohortSelections[c.id]) return true;
    }
    return false;
  }, [cohortCourses, cohortSelections]);

  const handleCheckout = async () => {
    setSubmitError(null);

    if (!selectedPriceId) {
      setSubmitError('Please select a pricing option');
      return;
    }

    if (missingCohortSelection) {
      setSubmitError('Please select a cohort for all cohort-based courses');
      return;
    }

    const cohortsList = Object.entries(cohortSelections)
      .filter(([courseId, cohortId]) => Boolean(courseId && cohortId))
      .map(([courseId, cohortId]) => ({ courseId, cohortId }));

    const sessionInput = {
      items: [
        {
          priceId: selectedPriceId,
          cohorts: cohortsList.length > 0 ? cohortsList : undefined,
        },
      ],
      couponCode: appliedCoupon ?? undefined,
      successPath: '/checkout/success',
      cancelPath: `/checkout?productId=${product.id}&priceId=${selectedPriceId}&workspaceId=${workspaceId}`,
    };

    try {
      const session = await checkoutMutation.mutateAsync({
        input: sessionInput,
        idempotencyKey: idempotencyKeyRef.current,
      });

      if (session.checkoutUrl) {
        // Record pending order ID in session storage before browser leaves origin
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem('lms_last_checkout_order_id', session.orderId);
        }
        // Redirect to Stripe Hosted Checkout
        window.location.href = session.checkoutUrl;
      } else {
        // Free zero-dollar checkout completes immediately
        router.push(`/checkout/success?orderId=${session.orderId}`);
      }
    } catch (err: unknown) {
      if (
        (typeof err === 'object' && err !== null && (err as { status?: number }).status === 503) ||
        (err instanceof Error &&
          (err.message.toLowerCase().includes('payments disabled') ||
            err.message.includes('503') ||
            (err as { code?: string }).code === 'SERVICE_UNAVAILABLE'))
      ) {
        setSubmitError(
          'Online card payments are currently unavailable for this academy. If you have a coupon code that grants 100% off or the course is free, free checkout is still accepted.',
        );
      } else {
        const message = err instanceof Error ? err.message : 'Checkout failed. Please try again.';
        setSubmitError(message);
      }
    }
  };

  const isEmailVerified = me ? me.emailVerifiedAt !== null : true;
  const isFree = quote ? quote.grandTotal === 0 : selectedPrice?.amount === 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Checkout</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Complete your enrollment in{' '}
          <span className="font-medium text-foreground">{product.name}</span> with {siteConfig.name}
          .
        </p>
      </div>

      {/* Unverified Email Warning */}
      {!isEmailVerified && (
        <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
          <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Email verification required</p>
            <p className="text-xs text-amber-800/90 dark:text-amber-300/90 mt-0.5">
              Your email must be verified before paid checkout or starting graded attempts. Please
              check your inbox or visit your account settings.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left Column: Product Selection & Configuration */}
        <div className="lg:col-span-2 space-y-6">
          {/* Product Summary Card */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {product.type === 'BUNDLE'
                      ? 'Course Bundle'
                      : product.type === 'SUBSCRIPTION_PLAN'
                        ? 'Subscription Plan'
                        : 'Single Course'}
                  </span>
                  <CardTitle className="text-xl mt-1">{product.name}</CardTitle>
                </div>
                {product.accessDurationDays && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{product.accessDurationDays} days access</span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Pricing tier options */}
              {product.prices.length > 1 && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-foreground">
                    Select Billing Plan:
                  </label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {activePrices.map((price) => (
                      <button
                        key={price.id}
                        type="button"
                        onClick={() => setSelectedPriceId(price.id)}
                        className={`flex flex-col p-3 rounded-lg border text-left transition-all ${
                          selectedPriceId === price.id
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                            : 'border-border hover:border-border/80'
                        }`}
                      >
                        <span className="font-bold text-sm text-foreground">
                          {formatMoney(price.amount, price.currency)}
                          {price.interval && (
                            <span className="text-xs font-normal text-muted-foreground">
                              {formatInterval(price.interval, price.intervalCount)}
                            </span>
                          )}
                        </span>
                        {price.trialDays > 0 && (
                          <span className="text-xs text-emerald-600 mt-1">
                            {price.trialDays}-day free trial
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Cohort Selection for cohort-mode courses */}
              {cohortCourses.length > 0 && (
                <div className="space-y-3 pt-3 border-t border-border">
                  <label className="text-xs font-semibold text-foreground block">
                    Choose Your Cohort / Schedule:
                  </label>
                  {cohortCourses.map((course) => (
                    <div key={course.id} className="space-y-1.5">
                      <span className="text-xs text-muted-foreground font-medium">
                        {course.title}:
                      </span>
                      {course.cohorts && course.cohorts.length > 0 ? (
                        <Select
                          value={cohortSelections[course.id] ?? ''}
                          onValueChange={(val) =>
                            setCohortSelections((prev) => ({ ...prev, [course.id]: val }))
                          }
                        >
                          <SelectTrigger className="w-full text-xs">
                            <SelectValue placeholder="Select an upcoming cohort" />
                          </SelectTrigger>
                          <SelectContent>
                            {course.cohorts.map((cohort) => (
                              <SelectItem key={cohort.id} value={cohort.id} className="text-xs">
                                {cohort.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-xs text-amber-600">
                          No open cohorts currently available.
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Inclusions summary */}
              <div className="pt-4 border-t border-border text-xs text-muted-foreground space-y-2">
                <div className="font-medium text-foreground flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  What is included:
                </div>
                <ul className="space-y-1 pl-4 list-disc">
                  <li>Full access to all course materials & future updates</li>
                  <li>Hands-on quizzes, assessments, and feedback</li>
                  <li>Discussion forum participation & community support</li>
                  <li>Verified certificate of completion upon finishing</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Order Summary & Payment Button */}
        <div className="space-y-6">
          <Card className="sticky top-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Coupon Form */}
              <CouponInput
                value={couponInput}
                appliedCode={appliedCoupon}
                discountAmountMinor={quote?.discountTotal}
                isLoading={isQuoteLoading}
                error={couponError}
                onChange={setCouponInput}
                onApply={handleApplyCoupon}
                onRemove={handleRemoveCoupon}
                disabled={checkoutMutation.isPending}
              />

              <Separator />

              {/* Price Calculation Lines */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>
                    {quote
                      ? formatMoney(quote.subtotal, quote.currency)
                      : selectedPrice
                        ? formatMoney(selectedPrice.amount, selectedPrice.currency)
                        : '—'}
                  </span>
                </div>

                {quote && quote.discountTotal > 0 && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-medium">
                    <span>Discount</span>
                    <span>-{formatMoney(quote.discountTotal, quote.currency)}</span>
                  </div>
                )}

                {quote && quote.taxTotal > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tax</span>
                    <span>{formatMoney(quote.taxTotal, quote.currency)}</span>
                  </div>
                )}

                <Separator />

                <div className="flex justify-between font-bold text-lg text-foreground pt-1">
                  <span>Total Due</span>
                  <span>
                    {isQuoteLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin inline" />
                    ) : quote ? (
                      formatMoney(quote.grandTotal, quote.currency)
                    ) : selectedPrice ? (
                      formatMoney(selectedPrice.amount, selectedPrice.currency)
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
              </div>

              {submitError && (
                <div
                  role="alert"
                  className="rounded-md border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-400 font-medium"
                >
                  {submitError}
                </div>
              )}

              {/* Primary Action Button */}
              <Button
                type="button"
                size="lg"
                onClick={handleCheckout}
                disabled={
                  checkoutMutation.isPending ||
                  isQuoteLoading ||
                  !selectedPriceId ||
                  missingCohortSelection ||
                  !isEmailVerified
                }
                className="w-full font-semibold gap-2 shadow-sm"
              >
                {checkoutMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : isFree ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Complete Free Enrollment
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4" />
                    Proceed to Stripe Checkout
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>

              <div className="space-y-2 text-center text-xs text-muted-foreground">
                <p className="flex items-center justify-center gap-1.5 text-[11px]">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Encrypted 256-bit SSL transaction
                </p>
                <p className="text-[11px]">
                  By proceeding, you agree to {siteConfig.name}&apos;s Terms of Service and Refund
                  Policy.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
