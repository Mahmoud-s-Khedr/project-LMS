'use client';

import { useState } from 'react';
import { Layers, RotateCcw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PRODUCT_TYPE_OPTIONS, type CatalogProductsQuery } from '../types';
import { useCatalogProductsQuery } from '../hooks';
import { ProductCard } from './product-card';

export function ProductCatalog() {
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const queryParams: Partial<CatalogProductsQuery> = {
    type:
      selectedType !== 'ALL'
        ? (selectedType as 'COURSE' | 'BUNDLE' | 'SUBSCRIPTION_PLAN')
        : undefined,
  };

  const { data, isLoading, isError, error, refetch } = useCatalogProductsQuery(queryParams);

  const allProducts = data?.data ?? [];

  // Filter client-side by search term if provided
  const filteredProducts = searchTerm.trim()
    ? allProducts.filter(
        (p) =>
          p.name.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
          p.courses.some((c) =>
            c.title.toLowerCase().includes(searchTerm.toLowerCase().trim()),
          ),
      )
    : allProducts;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="mb-8">
        <h1 className="font-serif text-3xl font-extrabold tracking-tight sm:text-4xl text-foreground">
          Course Bundles & All-Access Plans
        </h1>
        <p className="mt-2 text-base text-muted-foreground max-w-2xl">
          Unlock curated course tracks, masterclass bundles, and multi-course subscription passes with structured paths and lifetime privileges.
        </p>
      </div>

      {/* Controls */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search bundles, plans, or included topics..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 pr-9 h-11 bg-card border-border/80 text-foreground"
            aria-label="Search products and bundles"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Type Filter Pills */}
        <div className="flex flex-wrap items-center gap-2">
          {PRODUCT_TYPE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelectedType(opt.value)}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all ${
                selectedType === opt.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
          aria-busy="true"
          aria-label="Loading products"
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col rounded-xl border border-border/60 bg-card p-6 space-y-4"
            >
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-8 w-3/4" />
              <Skeleton className="h-16 w-full" />
              <div className="flex justify-between pt-4 border-t border-border/40">
                <Skeleton className="h-6 w-1/4" />
                <Skeleton className="h-6 w-1/4" />
              </div>
            </div>
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-12 text-center">
          <p className="font-serif text-lg font-bold text-destructive">
            Failed to load products
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'An error occurred while fetching products.'}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="mt-4 gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/80 bg-card p-12 text-center">
          <Layers className="mx-auto h-12 w-12 text-muted-foreground/40 mb-3" />
          <h3 className="font-serif text-xl font-bold tracking-tight">No products found</h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            {selectedType !== 'ALL' || searchTerm
              ? 'No products match your current filters. Try selecting a different type or clearing search.'
              : 'Our academy teams are assembling exciting course bundles and plans. Check back soon!'}
          </p>
          {(selectedType !== 'ALL' || searchTerm) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedType('ALL');
                setSearchTerm('');
              }}
              className="mt-5 gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filteredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
