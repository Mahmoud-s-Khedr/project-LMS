import { z } from 'zod';
import { cursorQuerySchema, cursorResponseSchema } from '../pagination';
import {
  courseStatusSchema,
  visibilitySchema,
  deliveryModeSchema,
  staffRoleSchema,
  lessonTypeSchema,
  billingIntervalSchema,
} from '../enums';
import {
  entityShape,
  titleSchema,
  nameSchema,
  slugSchema,
  localeSchema,
  versionSchema,
  positionSchema,
  uuidSchema,
  timestampSchema,
  richTextSchema,
  searchSchema,
  uniqueIdsSchema,
  percentSchema,
  partialObject,
  nonemptyPatch,
  responseSchema,
  httpsUrlSchema,
  currencySchema,
  moneySchema,
} from '../primitives';
export const courseCreateSchema = z.strictObject({
  slug: slugSchema,
  title: titleSchema,
  summary: z.string().trim().max(1000),
  description: richTextSchema,
  visibility: visibilitySchema.default('PUBLIC'),
  deliveryMode: deliveryModeSchema.default('SELF_PACED'),
  language: localeSchema.default('en'),
  level: z.string().max(40).nullable().optional(),
  isFree: z.boolean().default(false),
  estimatedMinutes: positionSchema.default(0),
  coverId: uuidSchema.nullable().optional(),
});
export const courseUpdateSchema = z
  .strictObject({ ...partialObject(courseCreateSchema.shape).shape, version: versionSchema })
  .refine((v) => Object.keys(v).some((k) => k !== 'version'), 'Provide a change');
export const courseSchema = z.strictObject({
  ...entityShape,
  ...courseCreateSchema.shape,
  level: z.string().max(40).nullable(),
  coverId: uuidSchema.nullable(),
  status: courseStatusSchema,
  version: versionSchema,
  createdById: uuidSchema,
  publishedAt: timestampSchema.nullable(),
  archivedAt: timestampSchema.nullable(),
});
export const publicCourseSchema = courseSchema
  .omit({
    createdById: true,
    archivedAt: true,
    coverId: true,
    updatedAt: true,
    version: true,
    createdAt: true,
  })
  .extend({
    status: z.literal('PUBLISHED'),
    visibility: z.enum(['PUBLIC', 'UNLISTED']),
    coverUrl: httpsUrlSchema.nullable(),
  });
export const catalogCoursesQuerySchema = cursorQuerySchema.extend({
  search: searchSchema.optional(),
  workspace: slugSchema.max(100).optional(),
  category: slugSchema.optional(),
  language: localeSchema.optional(),
  level: z.string().max(40).optional(),
  deliveryMode: deliveryModeSchema.optional(),
  sort: z.enum(['publishedAt', 'title']).default('publishedAt'),
});
export const catalogCourseBySlugQuerySchema = z.strictObject({
  workspace: slugSchema.max(100).optional(),
});
export type CatalogCourseBySlugQuery = z.infer<typeof catalogCourseBySlugQuerySchema>;
export const staffCoursesQuerySchema = cursorQuerySchema.extend({
  search: searchSchema.optional(),
  status: courseStatusSchema.optional(),
  staffId: uuidSchema.optional(),
});
export const categoryCreateSchema = z.strictObject({
  name: nameSchema.max(120),
  slug: slugSchema.max(100),
});
export const categoryUpdateSchema = nonemptyPatch(categoryCreateSchema.shape);
export const categorySchema = z.strictObject({ ...entityShape, ...categoryCreateSchema.shape });
export const courseCategoriesSchema = z.strictObject({ categoryIds: uniqueIdsSchema });
export const courseStaffUpsertSchema = z.strictObject({
  role: staffRoleSchema,
  canEditContent: z.boolean().default(false),
  canGrade: z.boolean().default(true),
  canManageLearners: z.boolean().default(false),
});
export const courseStaffSchema = z.strictObject({
  ...entityShape,
  ...courseStaffUpsertSchema.shape,
  courseId: uuidSchema,
  userId: uuidSchema,
  memberId: uuidSchema,
});
export const coursePrerequisiteSchema = z.strictObject({
  requiredCourseId: uuidSchema,
  minimumPercent: percentSchema,
});
export const coursePrerequisitesSchema = z.strictObject({
  prerequisites: z
    .array(coursePrerequisiteSchema)
    .max(100)
    .refine(
      (v) => new Set(v.map((x) => x.requiredCourseId)).size === v.length,
      'Duplicate prerequisite',
    ),
});
export const courseResponseSchema = responseSchema(courseSchema);
export const coursesResponseSchema = cursorResponseSchema(courseSchema);
export const catalogPriceSchema = z.strictObject({
  priceId: uuidSchema,
  productId: uuidSchema,
  currency: currencySchema,
  amount: moneySchema,
  interval: billingIntervalSchema.nullable(),
  intervalCount: z.number().int().min(1),
  trialDays: positionSchema,
});
export const publicOutlineLessonSchema = z
  .strictObject({
    lessonId: uuidSchema,
    title: titleSchema,
    type: lessonTypeSchema,
    position: positionSchema,
    isPreview: z.boolean(),
    estimatedMinutes: positionSchema,
  })
  .refine(
    (v) => !v.isPreview || !['QUIZ', 'ASSIGNMENT', 'EXAM', 'LIVE_SESSION'].includes(v.type),
    'Protected activities cannot be previews',
  );
export const publicCourseDetailSchema = publicCourseSchema.extend({
  prices: z.array(catalogPriceSchema).max(100),
  outline: z
    .array(
      z.strictObject({
        sectionId: uuidSchema,
        title: titleSchema,
        position: positionSchema,
        lessons: z.array(publicOutlineLessonSchema).max(1000),
      }),
    )
    .max(500),
});
export const catalogCourseResponseSchema = responseSchema(publicCourseDetailSchema);
export const catalogCoursesResponseSchema = cursorResponseSchema(publicCourseSchema);
export const categoryResponseSchema = responseSchema(categorySchema);
export const categoriesResponseSchema = cursorResponseSchema(categorySchema);
export const courseStaffResponseSchema = responseSchema(courseStaffSchema);
export const courseStaffListResponseSchema = cursorResponseSchema(courseStaffSchema);
export type Course = z.infer<typeof courseSchema>;
export type PublicCourse = z.infer<typeof publicCourseSchema>;
export type CourseCreate = z.infer<typeof courseCreateSchema>;
export type CourseUpdate = z.infer<typeof courseUpdateSchema>;
export type CatalogCoursesQuery = z.infer<typeof catalogCoursesQuerySchema>;
export type StaffCoursesQuery = z.infer<typeof staffCoursesQuerySchema>;
export type Category = z.infer<typeof categorySchema>;
export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdate = z.infer<typeof categoryUpdateSchema>;
export type CourseStaff = z.infer<typeof courseStaffSchema>;
export type CourseStaffUpsert = z.infer<typeof courseStaffUpsertSchema>;
export type CoursePrerequisites = z.infer<typeof coursePrerequisitesSchema>;
