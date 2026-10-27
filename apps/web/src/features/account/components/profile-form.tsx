'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle, CheckCircle2, Loader2, Mail, Save, ShieldCheck, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useProfileQuery, useUpdateProfileMutation } from '../hooks';
import { COMMON_LOCALES, COMMON_TIMEZONES } from '../types';

const profileFormSchema = z.strictObject({
  name: z.string().trim().min(1, 'Name is required').max(160),
  locale: z.string().min(2).max(20),
  timezone: z.string().min(1, 'Timezone is required'),
});

type ProfileFormValues = z.infer<typeof profileFormSchema>;

export function ProfileForm() {
  const { data: profile, isLoading, isError } = useProfileQuery();
  const updateMutation = useUpdateProfileMutation();
  const [success, setSuccess] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      name: '',
      locale: 'en-US',
      timezone: 'UTC',
    },
  });

  React.useEffect(() => {
    if (profile) {
      form.reset({
        name: profile.name || '',
        locale: profile.locale || 'en-US',
        timezone: profile.timezone || 'UTC',
      });
    }
  }, [profile, form]);

  async function onSubmit(values: ProfileFormValues) {
    setSuccess(false);
    setErrorMessage(null);
    try {
      await updateMutation.mutateAsync({
        name: values.name,
        locale: values.locale,
        timezone: values.timezone,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to update profile settings.');
    }
  }

  if (isLoading) {
    return (
      <Card className="border-border">
        <CardHeader>
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !profile) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="p-6 text-center text-sm text-destructive">
          Failed to load profile details.
        </CardContent>
      </Card>
    );
  }

  const isEmailVerified = Boolean(profile.emailVerifiedAt);

  return (
    <Card className="border-border">
      <CardHeader>
        <CardTitle className="text-lg font-semibold tracking-tight">Profile Information</CardTitle>
        <CardDescription className="text-xs">
          Manage your personal details, preferred language, and active display timezone.
        </CardDescription>
      </CardHeader>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <CardContent className="space-y-5">
            {success && (
              <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>Your profile has been successfully updated.</span>
              </div>
            )}

            {errorMessage && (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                <AlertCircle className="size-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Email Field (Read-only with verified status) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">Email Address</label>
                {isEmailVerified ? (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 text-[10px] py-0"
                  >
                    <ShieldCheck className="mr-1 size-3" />
                    Verified
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 bg-amber-500/10 text-amber-600 text-[10px] py-0"
                  >
                    Unverified
                  </Badge>
                )}
              </div>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={profile.email}
                  disabled
                  className="pl-9 bg-muted/30 cursor-not-allowed text-xs sm:text-sm"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Email address is tied to your primary authentication and cannot be changed here.
              </p>
            </div>

            {/* Full Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Full Name</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Your full name"
                        {...field}
                        className="pl-9 text-xs sm:text-sm"
                      />
                    </div>
                  </FormControl>
                  <FormDescription className="text-[11px]">
                    This name appears on your course completion certificates and workspace rosters.
                  </FormDescription>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            {/* Timezone */}
            <FormField
              control={form.control}
              name="timezone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Timezone</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="text-xs sm:text-sm">
                        <SelectValue placeholder="Select your timezone" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {COMMON_TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value} className="text-xs">
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription className="text-[11px]">
                    Cohort live session schedules and assignment deadlines are shown in this
                    timezone.
                  </FormDescription>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />

            {/* Locale */}
            <FormField
              control={form.control}
              name="locale"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs">Display Language / Locale</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="text-xs sm:text-sm">
                        <SelectValue placeholder="Select display locale" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {COMMON_LOCALES.map((loc) => (
                        <SelectItem key={loc.value} value={loc.value} className="text-xs">
                          {loc.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage className="text-xs" />
                </FormItem>
              )}
            />
          </CardContent>

          <CardFooter className="flex justify-end border-t border-border/60 pt-4">
            <Button
              type="submit"
              disabled={updateMutation.isPending || !form.formState.isDirty}
              className="text-xs"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="mr-1.5 size-3.5" />
                  Save Changes
                </>
              )}
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
