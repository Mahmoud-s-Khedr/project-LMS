import {
  z,
  Role,
  loginSchema as sharedLoginSchema,
  registerSchema as sharedRegisterSchema,
  emailRequestSchema as sharedEmailRequestSchema,
  resetPasswordSchema as sharedResetPasswordSchema,
  tokenRequestSchema as sharedTokenRequestSchema,
  changePasswordSchema as sharedChangePasswordSchema,
  sessionSchema,
  type SafeUser,
  type Me,
} from '@lms/shared';

export {
  sharedLoginSchema,
  sharedRegisterSchema,
  sharedEmailRequestSchema,
  sharedResetPasswordSchema,
  sharedTokenRequestSchema,
  sharedChangePasswordSchema,
};

export const loginFormSchema = z.object({
  email: z.string().trim().min(1, 'Email address is required').email('Enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .max(128, 'Password must be at most 128 characters'),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;

export const registerFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'Full name must be at least 2 characters')
      .max(160, 'Name must be at most 160 characters'),
    email: z
      .string()
      .trim()
      .min(1, 'Email address is required')
      .email('Enter a valid email address'),
    password: z
      .string()
      .min(12, 'Password must be at least 12 characters')
      .max(128, 'Password must be at most 128 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    onboardingMode: z.enum(['STUDENT', 'INSTRUCTOR']),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export type RegisterFormValues = z.infer<typeof registerFormSchema>;

export const forgotPasswordFormSchema = z.object({
  email: z.string().trim().min(1, 'Email address is required').email('Enter a valid email address'),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordFormSchema>;

export const resetPasswordFormSchema = z
  .object({
    token: z.string().trim().min(1, 'Reset token is required'),
    password: z
      .string()
      .min(12, 'New password must be at least 12 characters')
      .max(128, 'Password must be at most 128 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export type ResetPasswordFormValues = z.infer<typeof resetPasswordFormSchema>;

export const verifyEmailFormSchema = z.object({
  token: z.string().trim().min(1, 'Verification token is required'),
});

export type VerifyEmailFormValues = z.infer<typeof verifyEmailFormSchema>;

export const resendVerificationFormSchema = z.object({
  email: z.string().trim().min(1, 'Email address is required').email('Enter a valid email address'),
});

export type ResendVerificationFormValues = z.infer<typeof resendVerificationFormSchema>;

export const acceptInvitationFormSchema = z.object({
  token: z
    .string()
    .trim()
    .min(32, 'Invitation token must be at least 32 characters')
    .max(4096, 'Invitation token must be at most 4096 characters'),
});

export type AcceptInvitationFormValues = z.infer<typeof acceptInvitationFormSchema>;

export const changePasswordFormSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(128),
    password: z
      .string()
      .min(12, 'New password must be at least 12 characters')
      .max(128, 'Password must be at most 128 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;

export type UserSession = z.infer<typeof sessionSchema>;

export interface AuthSessionData {
  accessToken: string;
  expiresIn: number;
  user: SafeUser;
}

export interface AuthUserProfile extends Omit<Me, 'memberships'> {
  memberships: {
    id: string;
    workspaceId: string;
    role: Role;
    workspace: {
      id: string;
      name: string;
      slug: string;
      kind: 'PERSONAL' | 'ACADEMY';
    };
  }[];
}
