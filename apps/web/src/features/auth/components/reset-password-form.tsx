'use client';

import * as React from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
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
import { useResetPasswordMutation } from '../hooks';
import { resetPasswordFormSchema, type ResetPasswordFormValues } from '../schemas';
import { AuthErrorBanner } from './auth-error-banner';

export interface ResetPasswordFormProps {
  defaultToken?: string;
}

export function ResetPasswordForm({ defaultToken = '' }: ResetPasswordFormProps) {
  const resetMutation = useResetPasswordMutation();
  const [showPassword, setShowPassword] = React.useState(false);
  const [completed, setCompleted] = React.useState(false);

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordFormSchema),
    defaultValues: {
      token: defaultToken,
      password: '',
      confirmPassword: '',
    },
  });

  async function onSubmit(values: ResetPasswordFormValues) {
    try {
      await resetMutation.mutateAsync({
        token: values.token.trim(),
        password: values.password,
      });
      setCompleted(true);
    } catch {
      // Displayed via AuthErrorBanner
    }
  }

  if (completed) {
    return (
      <div role="status" className="space-y-6">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <CheckCircle2 className="size-6" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Password updated
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your password has been reset and all previous active sessions have been revoked for your
            security. You can now sign in with your new password.
          </p>
        </div>
        <Button asChild size="lg" className="w-full rounded-full">
          <Link href="/login">Proceed to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Choose a new password
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter your recovery token and a strong new password of at least 12 characters.
        </p>
      </div>

      <AuthErrorBanner error={resetMutation.error} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FormField
            control={form.control}
            name="token"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Recovery token</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="text"
                    placeholder="Paste your 64-character recovery token"
                    className="h-10 rounded-xl font-mono text-xs"
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
                <FormLabel>New password (12+ characters)</FormLabel>
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
                <FormLabel>Confirm new password</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="Repeat your new password"
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
            disabled={resetMutation.isPending}
            className="w-full rounded-full"
          >
            {resetMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span>Updating password...</span>
              </>
            ) : (
              <>
                <KeyRound className="size-4" aria-hidden="true" />
                <span>Save new password</span>
              </>
            )}
          </Button>
        </form>
      </Form>

      <div className="border-t border-border pt-5 text-center">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden="true" />
          <span>Back to sign in</span>
        </Link>
      </div>
    </div>
  );
}
