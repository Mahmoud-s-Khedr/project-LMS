'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useChangePasswordMutation } from '../hooks';
import { changePasswordFormSchema, type ChangePasswordFormValues } from '../schemas';
import { AuthErrorBanner } from './auth-error-banner';

export interface ChangePasswordFormProps {
  onSuccess?: () => void;
}

export function ChangePasswordForm({ onSuccess }: ChangePasswordFormProps) {
  const changePasswordMutation = useChangePasswordMutation();
  const [showCurrent, setShowCurrent] = React.useState(false);
  const [showNew, setShowNew] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: {
      currentPassword: '',
      password: '',
      confirmPassword: '',
    },
  });

  async function onSubmit(values: ChangePasswordFormValues) {
    try {
      await changePasswordMutation.mutateAsync({
        currentPassword: values.currentPassword,
        password: values.password,
      });
      setSuccess(true);
      form.reset();
      if (onSuccess) {
        onSuccess();
      }
    } catch {
      // Displayed via AuthErrorBanner
    }
  }

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-lg font-semibold tracking-tight">Change Password</CardTitle>
        <CardDescription>
          Update your account password. Changing your password will revoke all other active
          sessions.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {success && (
          <div
            role="status"
            className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-800 dark:text-emerald-200"
          >
            <CheckCircle2
              className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
              aria-hidden="true"
            />
            <span>Password updated successfully. Other sessions have been revoked.</span>
          </div>
        )}

        <AuthErrorBanner error={changePasswordMutation.error} />

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="space-y-4">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current password</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input
                        {...field}
                        type={showCurrent ? 'text' : 'password'}
                        autoComplete="current-password"
                        placeholder="Enter current password"
                        className="h-10 rounded-xl pr-10"
                      />
                    </FormControl>
                    <button
                      type="button"
                      onClick={() => setShowCurrent((prev) => !prev)}
                      aria-label={showCurrent ? 'Hide current password' : 'Show current password'}
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {showCurrent ? (
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
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password (12+ characters)</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input
                        {...field}
                        type={showNew ? 'text' : 'password'}
                        autoComplete="new-password"
                        placeholder="At least 12 characters"
                        className="h-10 rounded-xl pr-10"
                      />
                    </FormControl>
                    <button
                      type="button"
                      onClick={() => setShowNew((prev) => !prev)}
                      aria-label={showNew ? 'Hide new password' : 'Show new password'}
                      className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {showNew ? (
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
                      type={showNew ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="Repeat new password"
                      className="h-10 rounded-xl"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button
              type="submit"
              disabled={changePasswordMutation.isPending}
              className="rounded-full px-5"
            >
              {changePasswordMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  <span>Updating password...</span>
                </>
              ) : (
                <>
                  <KeyRound className="size-4" aria-hidden="true" />
                  <span>Update password</span>
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
