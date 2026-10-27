import Link from 'next/link';
import { BookOpen, Layers, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import type { PublicProduct } from '../types';
import { formatPriceMinor } from '../types';

interface ProductCardProps {
  product: PublicProduct;
  className?: string;
}

function getProductTypeBadge(type: string) {
  switch (type) {
    case 'BUNDLE':
      return (
        <Badge
          variant="default"
          className="flex items-center gap-1 bg-amber-600 text-white hover:bg-amber-700"
        >
          <Layers className="h-3 w-3" />
          Course Bundle
        </Badge>
      );
    case 'SUBSCRIPTION_PLAN':
      return (
        <Badge
          variant="default"
          className="flex items-center gap-1 bg-purple-600 text-white hover:bg-purple-700"
        >
          <Sparkles className="h-3 w-3" />
          All-Access Plan
        </Badge>
      );
    case 'COURSE':
    default:
      return (
        <Badge variant="secondary" className="flex items-center gap-1">
          <BookOpen className="h-3 w-3" />
          Single Course
        </Badge>
      );
  }
}

export function ProductCard({ product, className = '' }: ProductCardProps) {
  const lowestPrice = product.prices.find((p) => p.isActive) ?? product.prices[0];

  return (
    <Card
      className={`group flex flex-col justify-between overflow-hidden border border-border/70 bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg ${className}`}
      data-testid={`product-card-${product.id}`}
    >
      <CardHeader className="p-6 pb-4">
        <div className="flex items-center justify-between gap-2 mb-3">
          {getProductTypeBadge(product.type)}
          {product.accessDurationDays ? (
            <span className="text-xs text-muted-foreground">
              {product.accessDurationDays} days access
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Lifetime access</span>
          )}
        </div>

        <h3 className="line-clamp-2 font-serif text-xl font-bold tracking-tight text-card-foreground group-hover:text-primary transition-colors">
          <Link
            href={`/products/${product.id}`}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xs"
          >
            {product.name}
          </Link>
        </h3>

        <div className="mt-3 text-xs text-muted-foreground">
          {product.type === 'BUNDLE' && (
            <p className="font-medium text-foreground">
              Includes {product.courses.length}{' '}
              {product.courses.length === 1 ? 'course' : 'courses'}
            </p>
          )}
        </div>
      </CardHeader>

      <CardContent className="px-6 py-0 flex-1">
        {product.courses.length > 0 && (
          <div className="mt-2 space-y-1.5 border-t border-border/40 pt-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Featured courses included:
            </p>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {product.courses.slice(0, 3).map((c) => (
                <li key={c.id} className="truncate flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/60 shrink-0" />
                  <span className="truncate">{c.title}</span>
                </li>
              ))}
              {product.courses.length > 3 && (
                <li className="text-[11px] font-medium text-primary">
                  + {product.courses.length - 3} more courses
                </li>
              )}
            </ul>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex items-center justify-between border-t border-border/60 p-6 pt-4 text-sm">
        <div>
          {lowestPrice ? (
            <div className="flex items-baseline gap-1">
              <span className="text-lg font-bold text-foreground">
                {formatPriceMinor(
                  lowestPrice.amount,
                  lowestPrice.currency,
                  lowestPrice.interval,
                  lowestPrice.intervalCount,
                )}
              </span>
            </div>
          ) : (
            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              Free Access
            </span>
          )}
        </div>

        <Link
          href={`/products/${product.id}`}
          className="inline-flex items-center text-xs font-semibold text-primary hover:underline underline-offset-4"
        >
          View Plan &rarr;
        </Link>
      </CardFooter>
    </Card>
  );
}
