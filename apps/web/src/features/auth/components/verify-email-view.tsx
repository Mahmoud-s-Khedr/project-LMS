'use client';

import * as React from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowRight, CheckCircle2, Loader2, MailCheck, RefreshCw } from 'lucide-react';
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
import { useResendVerificationMutation, useVerifyEmailMutation } from '../hooks';
import {
  resendVerificationFormSchema,
  verifyEmailFormSchema,
  type ResendVerificationFormValues,
  type VerifyEmailFormValues,
} from '../schemas';
import { AuthErrorBanner } from './auth-error-banner';

export interface VerifyEmailViewProps {
  defaultToken?: string;
  defaultEmail?: string;
}

export function VerifyEmailView({ defaultToken = '', defaultEmail = '' }: VerifyEmailViewProps) {
  const verifyMutation = useVerifyEmailMutation();
  const resendMutation = useResendVerificationMutation();
  const [verified, setVerified] = React.useState(false);
  const [resendConfirmed, setResendConfirmed] = React.useState<string | null>(null);

  const verifyForm = useForm<VerifyEmailFormValues>({
    resolver: zodResolver(verifyEmailFormSchema),
    defaultValues: {
      token: defaultToken,
    },
  });

  const resendForm = useForm<ResendVerificationFormValues>({
    resolver: zodResolver(resendVerificationFormSchema),
    defaultValues: {
      email: defaultEmail,
    },
  });

  async function onVerifySubmit(values: VerifyEmailFormValues) {
    try {
      await verifyMutation.mutateAsync({ token: values.token.trim() });
      setVerified(true);
    } catch {
      // Displayed via AuthErrorBanner
    }
  }

  async function onResendSubmit(values: ResendVerificationFormValues) {
    try {
      const normalized = values.email.trim().toLowerCase();
      await resendMutation.mutateAsync({ email: normalized });
      setResendConfirmed(normalized);
    } catch {
      // Displayed via AuthErrorBanner
    }
  }

  if (verified) {
    return (
      <div role="status" className="space-y-6">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <CheckCircle2 className="size-6" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Email verified</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your email address has been confirmed. You now have full access to paid checkouts,
            cohort discussions, and instructor studio features.
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          <Button asChild size="lg" className="w-full rounded-full">
            <Link href="/student">
              <span>Continue to Workspace</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full rounded-full">
            <Link href="/login">Sign in</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-7">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Verify your email address
        </h1>
        <p className="text-sm text-muted-foreground">
          Confirm your verification token below, or request a fresh verification link.
        </p>
      </div>

      <AuthErrorBanner error={verifyMutation.error ?? resendMutation.error} />

      <Form {...verifyForm}>
        <form onSubmit={verifyForm.handleSubmit(onVerifySubmit)} noValidate className="space-y-4">
          <FormField
            control={verifyForm.control}
            name="token"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Verification token</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="text"
                    placeholder="Paste verification token from your email"
                    className="h-10 rounded-xl font-mono text-xs"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            size="lg"
            disabled={verifyMutation.isPending}
            className="w-full rounded-full"
          >
            {verifyMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span>Verifying token...</span>
              </>
            ) : (
              <>
                <MailCheck className="size-4" aria-hidden="true" />
                <span>Confirm email verification</span>
              </>
            )}
          </Button>
        </form>
      </Form>

      <div className="border-t border-border pt-6">
        <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
          Didn&apos;t receive the verification email?
        </h2>

        {resendConfirmed ? (
          <p role="status" className="mt-2.5 text-xs font-medium text-primary">
            A new verification link has been queued for <strong>{resendConfirmed}</strong>.
          </p>
        ) : (
          <Form {...resendForm}>
            <form
              onSubmit={resendForm.handleSubmit(onResendSubmit)}
              noValidate
              className="mt-3 space-y-3"
            >
              <FormField
                control={resendForm.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-xs">Account email address</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        type="email"
                        autoComplete="email"
                        placeholder="you@example.com"
                        className="h-9 rounded-xl text-xs"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                variant="outline"
                size="sm"
                disabled={resendMutation.isPending}
                className="w-full rounded-full"
              >
                {resendMutation.isPending ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <RefreshCw className="size-3.5" aria-hidden="true" />
                    <span>Resend verification email</span>
                  </>
                )}
              </Button>
            </form>
          </Form>
        )}
      </div>
    </div>
  );
}
