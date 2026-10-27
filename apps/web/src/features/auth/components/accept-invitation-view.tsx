'use client';

import * as React from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  LogIn,
  MailWarning,
  UserPlus,
} from 'lucide-react';
import type { WorkspaceMember } from '@lms/shared';
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
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useAcceptInvitationMutation, useMeQuery } from '../hooks';
import { acceptInvitationFormSchema, type AcceptInvitationFormValues } from '../schemas';
import { AuthErrorBanner } from './auth-error-banner';
import { siteConfig } from '@/features/marketing/site-config';

export interface AcceptInvitationViewProps {
  defaultToken?: string;
  onSuccess?: (member: WorkspaceMember) => void;
}

export function AcceptInvitationView({ defaultToken = '', onSuccess }: AcceptInvitationViewProps) {
  const { data: me, isPending: mePending, isError: meError } = useMeQuery();
  const acceptMutation = useAcceptInvitationMutation();
  const [acceptedMember, setAcceptedMember] = React.useState<WorkspaceMember | null>(null);

  const form = useForm<AcceptInvitationFormValues>({
    resolver: zodResolver(acceptInvitationFormSchema),
    defaultValues: {
      token: defaultToken,
    },
  });

  // Keep form in sync if defaultToken changes
  React.useEffect(() => {
    if (defaultToken && !form.getValues('token')) {
      form.setValue('token', defaultToken);
    }
  }, [defaultToken, form]);

  async function onSubmit(values: AcceptInvitationFormValues) {
    try {
      const member = await acceptMutation.mutateAsync({
        token: values.token.trim(),
      });
      setAcceptedMember(member);
      if (onSuccess) {
        onSuccess(member);
      }
    } catch {
      // Handled via acceptMutation.error and AuthErrorBanner
    }
  }

  // 1. Loading state while checking current user session
  if (mePending) {
    return (
      <div role="status" aria-label="Checking session" className="space-y-4">
        <span className="sr-only">Checking session...</span>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  // 2. Unauthenticated state: prompt to sign in or register
  const currentToken = form.watch('token') || defaultToken;
  const redirectPath = currentToken
    ? `/accept-invitation?token=${encodeURIComponent(currentToken)}`
    : '/accept-invitation';

  if (!me || meError) {
    return (
      <div className="space-y-6">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <KeyRound className="size-6" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Workspace Invitation
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            You have received an invitation to collaborate in a {siteConfig.name} workspace. Please
            sign in or create an account with the invited email address to accept your invitation.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button asChild size="lg" className="w-full rounded-full">
            <Link href={`/login?redirect=${encodeURIComponent(redirectPath)}`}>
              <LogIn className="size-4" aria-hidden="true" />
              <span>Sign in to accept</span>
            </Link>
          </Button>

          <Button asChild variant="outline" size="lg" className="w-full rounded-full">
            <Link href={`/register?redirect=${encodeURIComponent(redirectPath)}`}>
              <UserPlus className="size-4" aria-hidden="true" />
              <span>Create free account</span>
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // 3. Accepted success state
  if (acceptedMember) {
    const destinationPath =
      acceptedMember.role === 'ADMIN'
        ? '/admin'
        : acceptedMember.role === 'INSTRUCTOR' || acceptedMember.role === 'TEACHING_ASSISTANT'
          ? '/instructor'
          : '/student';

    return (
      <div role="status" className="space-y-6">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
          <CheckCircle2 className="size-6" aria-hidden="true" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Invitation Accepted
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            You have joined the workspace as{' '}
            <Badge variant="secondary" className="font-semibold">
              {acceptedMember.role}
            </Badge>
            . Your permissions have been updated.
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <Button asChild size="lg" className="w-full rounded-full">
            <Link href={destinationPath}>
              <span>Enter Workspace</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // 4. Authenticated state: review and accept
  const isEmailUnverified = !me.emailVerifiedAt;

  return (
    <div className="space-y-6">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Accept Workspace Invitation
        </h1>
        <p className="text-sm text-muted-foreground">
          Confirm your invitation token below to join the workspace.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
        Signed in as <span className="font-semibold text-foreground">{me.email}</span>
      </div>

      {isEmailUnverified && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-800 dark:text-amber-200"
        >
          <MailWarning
            className="size-4 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
          <div className="space-y-1">
            <p className="font-semibold">Email address not verified</p>
            <p className="leading-relaxed">
              Workspace invitations require a verified email address matching the invitation
              recipient.
            </p>
            <Link
              href={`/verify-email?email=${encodeURIComponent(me.email)}`}
              className="font-medium underline hover:text-foreground"
            >
              Verify your email now &rarr;
            </Link>
          </div>
        </div>
      )}

      <AuthErrorBanner error={acceptMutation.error} />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
          <FormField
            control={form.control}
            name="token"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Invitation token</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    type="text"
                    placeholder="Enter your invitation token"
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
            disabled={acceptMutation.isPending}
            className="w-full rounded-full"
          >
            {acceptMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                <span>Joining workspace...</span>
              </>
            ) : (
              <>
                <span>Accept invitation</span>
                <ArrowRight className="size-4" aria-hidden="true" />
              </>
            )}
          </Button>
        </form>
      </Form>
    </div>
  );
}
