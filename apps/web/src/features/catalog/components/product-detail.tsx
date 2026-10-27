'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Layers,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { PublicProduct, ProductPrice } from '../types';
import { formatPriceMinor } from '../types';
import { RichTextRenderer } from './rich-text-renderer';
import { CourseCard } from './course-card';

interface ProductDetailProps {
  product: PublicProduct;
}

export function ProductDetail({ product }: ProductDetailProps) {
  const activePrices = product.prices.filter((p) => p.isActive);
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(
    activePrices[0]?.id ?? product.prices[0]?.id ?? null,
  );

  const selectedPrice: ProductPrice | undefined =
    product.prices.find((p) => p.id === selectedPriceId) ?? activePrices[0] ?? product.prices[0];

  const isBundle = product.type === 'BUNDLE';
  const isSubscription = product.type === 'SUBSCRIPTION_PLAN';

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="mb-6 flex items-center gap-2 text-xs text-muted-foreground">
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        <span>/</span>
        <Link href="/products" className="hover:text-foreground">
          Products
        </Link>
        <span>/</span>
        <span className="truncate max-w-[250px] font-medium text-foreground">
          {product.name}
        </span>
      </nav>

      <div className="grid gap-10 lg:grid-cols-3">
        {/* Main Column */}
        <div className="lg:col-span-2 space-y-10">
          <div>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {isBundle ? (
                <Badge variant="default" className="bg-amber-600 hover:bg-amber-700">
                  <Layers className="mr-1 h-3 w-3 inline" />
                  Course Bundle
                </Badge>
              ) : isSubscription ? (
                <Badge variant="default" className="bg-purple-600 hover:bg-purple-700">
                  <Sparkles className="mr-1 h-3 w-3 inline" />
                  Subscription Pass
                </Badge>
              ) : (
                <Badge variant="secondary">
                  <BookOpen className="mr-1 h-3 w-3 inline" />
                  Course Product
                </Badge>
              )}

              {product.accessDurationDays ? (
                <Badge variant="outline" className="gap-1">
                  <Clock className="h-3 w-3" />
                  {product.accessDurationDays} Days Access
                </Badge>
              ) : (
                <Badge variant="outline">Lifetime Access</Badge>
              )}
            </div>

            <h1 className="font-serif text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
              {product.name}
            </h1>

            {product.description && (
              <div className="mt-6 rounded-xl border border-border/60 bg-card p-6 shadow-xs">
                <RichTextRenderer content={product.description} />
              </div>
            )}
          </div>

          {/* Included Courses Section */}
          {product.courses.length > 0 && (
            <div className="space-y-4">
              <div>
                <h2 className="font-serif text-2xl font-bold tracking-tight text-foreground">
                  Courses Included in this {isBundle ? 'Bundle' : 'Plan'}
                </h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Enrolling grants immediate learner access to all {product.courses.length}{' '}
                  curated courses below.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {product.courses.map((course) => (
                  <CourseCard key={course.id} course={course} />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Sidebar Sticky Purchase Card */}
        <div className="space-y-6">
          <Card className="sticky top-20 border border-border/80 shadow-xl overflow-hidden bg-card">
            <CardHeader className="p-6 pb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pricing & Membership
              </span>

              <div className="mt-2 flex items-baseline gap-2">
                {selectedPrice ? (
                  <span className="text-3xl font-extrabold text-foreground">
                    {formatPriceMinor(
                      selectedPrice.amount,
                      selectedPrice.currency,
                      selectedPrice.interval,
                      selectedPrice.intervalCount,
                    )}
                  </span>
                ) : (
                  <span className="text-2xl font-bold text-foreground">
                    Free Access
                  </span>
                )}
              </div>

              {/* Price Options selector */}
              {product.prices.length > 1 && (
                <div className="mt-5 space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">
                    Select payment option:
                  </label>
                  <div className="space-y-2">
                    {product.prices.map((price) => (
                      <button
                        key={price.id}
                        type="button"
                        onClick={() => setSelectedPriceId(price.id)}
                        className={`w-full rounded-lg border p-3 text-left text-xs transition-all ${
                          selectedPriceId === price.id
                            ? 'border-primary bg-primary/5 font-semibold text-primary'
                            : 'border-border hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span>
                            {price.interval
                              ? `${price.interval.toLowerCase()}ly billing`
                              : 'One-time payment'}
                          </span>
                          <span className="font-bold">
                            {formatPriceMinor(
                              price.amount,
                              price.currency,
                              price.interval,
                              price.intervalCount,
                            )}
                          </span>
                        </div>
                        {price.trialDays > 0 && (
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Includes {price.trialDays}-day free trial
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardHeader>

            <CardContent className="p-6 pt-2 space-y-6">
              <div className="space-y-2">
                <Button asChild size="lg" className="w-full text-base font-semibold shadow-md">
                  <Link href={`/register?redirect=/products/${product.id}`}>
                    Get Instant Access
                  </Link>
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  Includes all updates, resources & support
                </p>
              </div>

              {/* Inclusions checklist */}
              <div className="space-y-3 border-t border-border/70 pt-5 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Access to all {product.courses.length} courses in this package</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>
                    {product.accessDurationDays
                      ? `${product.accessDurationDays} days of guaranteed access`
                      : 'Lifetime access to current and updated modules'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Individual certificates for each completed course</span>
                </div>
              </div>

              {/* Guarantee */}
              <div className="rounded-lg bg-muted/40 p-3 flex items-center gap-3 text-xs text-muted-foreground border border-border/40">
                <ShieldCheck className="h-5 w-5 text-primary shrink-0" />
                <span>
                  Backed by our 30-day money-back guarantee.
                </span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
