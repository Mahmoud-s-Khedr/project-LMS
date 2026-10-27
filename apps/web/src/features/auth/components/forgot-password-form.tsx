'use client';

import * as React from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CheckCircle2, Loader2, Mail } from 'lucide-react';
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
import { useForgotPasswordMutation } from '../hooks';
import { forgotPasswordFormSchema, type ForgotPasswordFormValues } from '../schemas';
import { AuthErrorBanner } from './auth-error-banner';

export function ForgotPasswordForm() {
  const forgotMutation = useForgotPasswordMutation();
  const [submittedEmail, setSubmittedEmail] = React.useState<string | null>(null);

  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordFormSchema),
    defaultValues: {
      email: '',
    },
  });

  async function onSubmit(values: ForgotPasswordFormValues) {
    try {
      const normalized = values.email.trim().toLowerCase();
      await forgotPasswordMutationCall(normalized);
      setSubmittedEmail(normalized);
    } catch {
      // Error displayed via AuthErrorBanner
    }
  }

  async function forgotPasswordMutationCall(email: string) {
    await forgotMutation.mutateAsync({ email });
  }

  if (submittedEmail) {
    return (
      <div role="status" className="space-y-6">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <CheckCircle2 className="size-6" aria-hidden="true" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Check your inbox
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            If an account exists for <strong className="text-foreground">{submittedEmail}</strong>,
            we have sent password reset instructions and a one-time recovery token.
          </p>
        </div>

        <div className="space-y-2.5 pt-2">
          <Button asChild className="w-full rounded-full">
            <Link href="/reset-password">Enter reset token</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSubmittedEmail(null);
              forgotMutation.reset();
            }}
            className="w-full rounded-full"
          >
            Try a different email address
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Reset your password
        </h1>
        <p className="text-sm text-muted-foreground">
          Enter the email address associated with your account and we&apos;ll send a reset link.
        </p>
      </div>

      <AuthErrorBanner error={forgotMutation.error} />

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

          <Button
            type="submit"
            size="lg"
            disabled={forgotMutation.isPending}
            className="w-full rounded-full"
          >
            {forgotMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span>Sending reset link...</span>
              </>
            ) : (
              <>
                <Mail className="size-4" aria-hidden="true" />
                <span>Send recovery instructions</span>
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
