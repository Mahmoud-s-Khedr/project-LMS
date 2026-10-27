'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Loader2, Sparkles, User } from 'lucide-react';
import type { Workspace } from '@lms/shared';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { AuthErrorBanner } from '@/features/auth/components/auth-error-banner';
import { useCreateWorkspaceMutation } from '../hooks';
import { workspaceFormSchema, type WorkspaceFormValues } from '../schemas';

export interface CreateWorkspaceFormProps {
  defaultKind?: 'PERSONAL' | 'ACADEMY';
  onSuccess?: (workspace: Workspace) => void;
  onCancel?: () => void;
}

const COMMON_TIMEZONES = [
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'America/New_York', label: 'America/New York (Eastern Time)' },
  { value: 'America/Chicago', label: 'America/Chicago (Central Time)' },
  { value: 'America/Denver', label: 'America/Denver (Mountain Time)' },
  { value: 'America/Los_Angeles', label: 'America/Los Angeles (Pacific Time)' },
  { value: 'Europe/London', label: 'Europe/London (GMT / BST)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET)' },
  { value: 'Europe/Berlin', label: 'Europe/Berlin (CET)' },
  { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
  { value: 'Asia/Singapore', label: 'Asia/Singapore (SGT)' },
  { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST)' },
] as const;

const COMMON_CURRENCIES = [
  { value: 'usd', label: 'USD ($) — US Dollar' },
  { value: 'eur', label: 'EUR (€) — Euro' },
  { value: 'gbp', label: 'GBP (£) — British Pound' },
  { value: 'cad', label: 'CAD ($) — Canadian Dollar' },
  { value: 'aud', label: 'AUD ($) — Australian Dollar' },
] as const;

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export function CreateWorkspaceForm({
  defaultKind = 'PERSONAL',
  onSuccess,
  onCancel,
}: CreateWorkspaceFormProps) {
  const createMutation = useCreateWorkspaceMutation();
  const [slugManuallyEdited, setSlugManuallyEdited] = React.useState(false);

  const form = useForm<WorkspaceFormValues>({
    resolver: zodResolver(workspaceFormSchema),
    defaultValues: {
      kind: defaultKind,
      name: '',
      slug: '',
      description: '',
      defaultCurrency: 'usd',
      timezone: 'UTC',
      logoUrl: '',
    },
  });

  const handleNameChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    fieldChange: (val: string) => void,
  ) => {
    const newName = e.target.value;
    fieldChange(newName);
    if (!slugManuallyEdited) {
      form.setValue('slug', slugify(newName), { shouldValidate: true });
    }
  };

  async function onSubmit(values: WorkspaceFormValues) {
    try {
      const created = await createMutation.mutateAsync({
        kind: values.kind,
        name: values.name.trim(),
        slug: values.slug.trim().toLowerCase(),
        description: values.description?.trim() ? values.description.trim() : null,
        defaultCurrency: values.defaultCurrency.trim().toLowerCase(),
        timezone: values.timezone.trim(),
        logoUrl: values.logoUrl?.trim() ? values.logoUrl.trim() : null,
      });

      if (onSuccess) {
        onSuccess(created);
      }
    } catch {
      // Handled via createMutation.error and AuthErrorBanner
    }
  }

  return (
    <div className="space-y-6">
      <AuthErrorBanner error={createMutation.error} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-5">
          {/* Workspace Kind Selector */}
          <FormField
            control={form.control}
            name="kind"
            render={({ field }) => (
              <FormItem>
                <FormLabel id="workspace-kind-label">Workspace Type</FormLabel>
                <div
                  role="radiogroup"
                  aria-labelledby="workspace-kind-label"
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={field.value === 'PERSONAL'}
                    onClick={() => field.onChange('PERSONAL')}
                    className={cn(
                      'flex flex-col items-start gap-1.5 rounded-2xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      field.value === 'PERSONAL'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background/60 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <User className="size-4 text-primary" aria-hidden="true" />
                      <span className="text-sm font-semibold">Personal Studio</span>
                    </div>
                    <span className="text-xs leading-relaxed opacity-85">
                      For individual instructors, independent creators, or solopreneurs.
                    </span>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={field.value === 'ACADEMY'}
                    onClick={() => field.onChange('ACADEMY')}
                    className={cn(
                      'flex flex-col items-start gap-1.5 rounded-2xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      field.value === 'ACADEMY'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background/60 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Building2 className="size-4 text-primary" aria-hidden="true" />
                      <span className="text-sm font-semibold">Academy &amp; Team</span>
                    </div>
                    <span className="text-xs leading-relaxed opacity-85">
                      For multi-instructor academies, teams, or training organizations.
                    </span>
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Workspace Name */}
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Workspace Name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="text"
                    placeholder="e.g. Apex Coding Academy"
                    onChange={(e) => handleNameChange(e, field.onChange)}
                    className="h-10 rounded-xl"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Workspace Slug */}
          <FormField
            control={form.control}
            name="slug"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Workspace URL Slug</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="text"
                    placeholder="apex-coding-academy"
                    onChange={(e) => {
                      setSlugManuallyEdited(true);
                      field.onChange(e.target.value.toLowerCase());
                    }}
                    className="h-10 rounded-xl font-mono text-xs"
                  />
                </FormControl>
                <FormDescription className="text-[11px]">
                  Public catalog URL: /catalog/workspaces/{field.value || 'your-slug'}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Description */}
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (Optional)</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="Briefly describe your workspace or course offerings..."
                    className="rounded-xl min-h-20 text-xs"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Default Currency */}
            <FormField
              control={form.control}
              name="defaultCurrency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Currency</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-10 rounded-xl">
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {COMMON_CURRENCIES.map((currency) => (
                        <SelectItem key={currency.value} value={currency.value}>
                          {currency.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Timezone */}
            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Timezone</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger className="h-10 rounded-xl">
                        <SelectValue placeholder="Select timezone" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {COMMON_TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Logo URL */}
          <FormField
            control={form.control}
            name="logoUrl"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Logo URL (Optional)</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="url"
                    placeholder="https://example.com/logo.png"
                    className="h-10 rounded-xl"
                  />
                </FormControl>
                <FormDescription className="text-[11px]">
                  Must be an HTTPS image URL.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            {onCancel && (
              <Button type="button" variant="outline" onClick={onCancel} className="rounded-full">
                Cancel
              </Button>
            )}

            <Button type="submit" disabled={createMutation.isPending} className="rounded-full px-6">
              {createMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span>Creating workspace...</span>
                </>
              ) : (
                <>
                  <Sparkles className="size-4" aria-hidden="true" />
                  <span>Create Workspace</span>
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
