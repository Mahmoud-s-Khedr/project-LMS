'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, Eye, EyeOff, Loader2 } from 'lucide-react';
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
import {
  extractEffectiveRoles,
  resolveDefaultDashboardPath,
} from '@/features/shell/config/nav-config';
import { useLoginMutation } from '../hooks';
import { fetchCurrentUser } from '../api';
import { loginFormSchema, type AuthSessionData, type LoginFormValues } from '../schemas';
import { AuthErrorBanner } from './auth-error-banner';
import { safeRedirect } from '@/lib/safe-redirect';
import { siteConfig } from '@/features/marketing/site-config';

export interface LoginFormProps {
  redirectTo?: string;
  onSuccess?: (session: AuthSessionData) => void;
}

export function LoginForm({ redirectTo, onSuccess }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const loginMutation = useLoginMutation();
  const [showPassword, setShowPassword] = React.useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  async function onSubmit(values: LoginFormValues) {
    try {
      const session = await loginMutation.mutateAsync({
        email: values.email.trim().toLowerCase(),
        password: values.password,
      });

      // Honour ?redirect parameter if safe relative path
      const redirectQuery = searchParams?.get('redirect') ?? undefined;
      const targetRedirect = safeRedirect(redirectTo ?? redirectQuery);

      if (targetRedirect) {
        if (onSuccess) {
          onSuccess(session);
        }
        router.push(targetRedirect);
        return;
      }

      // Wait for /me memberships before choosing default dashboard
      let effectiveUser = session?.user;
      try {
        const me = await fetchCurrentUser();
        if (me) {
          effectiveUser = me;
        }
      } catch {
        // Fallback to session.user if /me is unreachable
      }

      if (onSuccess) {
        onSuccess(session);
        return;
      }

      const roles = extractEffectiveRoles(effectiveUser);
      router.push(resolveDefaultDashboardPath(roles));
    } catch {
      // Handled via loginMutation.error and AuthErrorBanner
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Welcome back
        </h1>
        <p className="text-sm text-muted-foreground">
          Sign in to access your courses, cohorts, and teaching workspaces.
        </p>
      </div>

      <AuthErrorBanner error={loginMutation.error} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
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
                <div className="flex items-center justify-between">
                  <FormLabel>Password</FormLabel>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <FormControl>
                    <Input
                      {...field}
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      placeholder="Enter your password"
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

          <Button
            type="submit"
            size="lg"
            disabled={loginMutation.isPending}
            className="mt-2 w-full rounded-full"
          >
            {loginMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span>Signing in...</span>
              </>
            ) : (
              <>
                <span>Sign in</span>
                <ArrowRight className="size-4" aria-hidden="true" />
              </>
            )}
          </Button>
        </form>
      </Form>

      <div className="border-t border-border pt-5 text-center text-xs text-muted-foreground">
        Don&apos;t have a {siteConfig.name} account yet?{' '}
        <Link href="/register" className="font-semibold text-primary hover:underline">
          Create a free account
        </Link>
      </div>
    </div>
  );
}
