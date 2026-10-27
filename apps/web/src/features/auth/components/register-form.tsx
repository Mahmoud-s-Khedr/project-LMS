'use client';

import { safeRedirect } from '@/lib/safe-redirect';

import * as React from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Eye, EyeOff, GraduationCap, Loader2, Mail, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useRegisterMutation } from '../hooks';
import type { RegisterResult } from '../api';
import { registerFormSchema, type RegisterFormValues } from '../schemas';
import { AuthErrorBanner } from './auth-error-banner';
import { siteConfig } from '@/features/marketing/site-config';

export interface RegisterFormProps {
  defaultRole?: 'STUDENT' | 'INSTRUCTOR';
  redirectTo?: string;
  onSuccess?: (result: RegisterResult) => void;
}

export function RegisterForm({
  defaultRole = 'STUDENT',
  redirectTo,
  onSuccess,
}: RegisterFormProps) {
  const registerMutation = useRegisterMutation();
  const [showPassword, setShowPassword] = React.useState(false);
  const [submittedEmail, setSubmittedEmail] = React.useState<string | null>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      onboardingMode: defaultRole,
    },
  });

  const safeTarget = safeRedirect(redirectTo);

  React.useEffect(() => {
    if (submittedEmail) {
      headingRef.current?.focus();
    }
  }, [submittedEmail]);

  async function onSubmit(values: RegisterFormValues) {
    try {
      const normalizedEmail = values.email.trim().toLowerCase();
      const result = await registerMutation.mutateAsync({
        name: values.name.trim(),
        email: normalizedEmail,
        password: values.password,
        onboardingMode: values.onboardingMode,
      });

      setSubmittedEmail(normalizedEmail);
      onSuccess?.(result);
    } catch {
      // Handled via registerMutation.error and AuthErrorBanner
    }
  }

  function handleReset() {
    setSubmittedEmail(null);
    registerMutation.reset();
    form.reset({
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      onboardingMode: defaultRole,
    });
  }

  if (submittedEmail) {
    const loginHref = safeTarget ? `/login?redirect=${encodeURIComponent(safeTarget)}` : '/login';

    return (
      <div role="status" aria-live="polite" className="space-y-6">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <Mail className="size-6" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl focus:outline-none"
          >
            Check your email for next steps
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            We sent instructions to{' '}
            <strong className="font-semibold text-foreground">{submittedEmail}</strong>. Check your
            inbox to finish setting up your account or sign in.
          </p>
        </div>

        <div className="space-y-2.5 pt-2">
          <Button asChild size="lg" className="w-full rounded-full">
            <Link href={loginHref}>Sign in</Link>
          </Button>

          <Button asChild variant="outline" size="lg" className="w-full rounded-full">
            <Link href="/forgot-password">Forgot password?</Link>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="lg"
            onClick={handleReset}
            className="w-full rounded-full"
          >
            Use a different email
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Create your account
        </h1>
        <p className="text-sm text-muted-foreground">
          Join {siteConfig.name} to enroll in studio courses or launch your own teaching workspace.
        </p>
      </div>

      <AuthErrorBanner error={registerMutation.error} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FormField
            control={form.control}
            name="onboardingMode"
            render={({ field }) => (
              <FormItem>
                <FormLabel id="onboarding-mode-label">
                  How will you primarily use {siteConfig.name}?
                </FormLabel>
                <div
                  role="radiogroup"
                  aria-labelledby="onboarding-mode-label"
                  className="grid grid-cols-2 gap-2.5"
                >
                  <button
                    type="button"
                    role="radio"
                    aria-checked={field.value === 'STUDENT'}
                    onClick={() => field.onChange('STUDENT')}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      field.value === 'STUDENT'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background/60 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <GraduationCap className="size-4 text-primary" aria-hidden="true" />
                    <span className="text-xs font-semibold">I want to learn</span>
                    <span className="text-[11px] opacity-80">Take courses &amp; cohorts</span>
                  </button>

                  <button
                    type="button"
                    role="radio"
                    aria-checked={field.value === 'INSTRUCTOR'}
                    onClick={() => field.onChange('INSTRUCTOR')}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                      field.value === 'INSTRUCTOR'
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border bg-background/60 text-muted-foreground hover:text-foreground',
                    )}
                  >
                    <Video className="size-4 text-primary" aria-hidden="true" />
                    <span className="text-xs font-semibold">I want to teach</span>
                    <span className="text-[11px] opacity-80">Create &amp; sell courses</span>
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full name</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="text"
                    autoComplete="name"
                    placeholder="Ada Lovelace"
                    className="h-10 rounded-xl"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email address</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="h-10 rounded-xl"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password (12+ characters)</FormLabel>
                <div className="relative">
                  <FormControl>
                    <Input
                      {...field}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="At least 12 characters"
                      className="h-10 rounded-xl pr-10"
                    />
                  </FormControl>
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" aria-hidden="true" />
                    ) : (
                      <Eye className="size-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirmPassword"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm password</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Repeat your password"
                    className="h-10 rounded-xl"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            size="lg"
            disabled={registerMutation.isPending}
            className="mt-2 w-full rounded-full"
          >
            {registerMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span>Creating account...</span>
              </>
            ) : (
              <>
                <span>Create account</span>
                <ArrowRight className="size-4" aria-hidden="true" />
              </>
            )}
          </Button>
        </form>
      </Form>

      <div className="border-t border-border pt-5 text-center text-xs text-muted-foreground">
        Already have an account?{' '}
        <Link
          href={safeTarget ? `/login?redirect=${encodeURIComponent(safeTarget)}` : '/login'}
          className="font-semibold text-primary hover:underline"
        >
          Sign in instead
        </Link>
      </div>
    </div>
  );
}
