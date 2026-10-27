export type CourseLevel = 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';

export type CourseDeliveryMode = 'SELF_PACED' | 'COHORT';

export type LessonKind = 'VIDEO' | 'ARTICLE' | 'QUIZ' | 'ASSIGNMENT' | 'LIVE_SESSION';

export type CourseCategory =
  | 'Software Engineering'
  | 'Design & Creative Systems'
  | 'Data & AI'
  | 'Product & Leadership';

export type CourseLanguageCode = 'en' | 'es' | 'de' | 'fr';

export interface CourseLesson {
  id: string;
  title: string;
  kind: LessonKind;
  durationMinutes: number;
  isFreePreview: boolean;
  dripDaysOffset?: number;
  summary: string;
}

export interface CourseSection {
  id: string;
  title: string;
  description: string;
  order: number;
  lessons: CourseLesson[];
}

export interface CourseInstructor {
  id: string;
  name: string;
  headline: string;
  bio: string;
  avatarInitials: string;
  credentials: string[];
  coursesCount: number;
  learnersCount: number;
  rating: number;
}

export interface CourseReview {
  id: string;
  authorName: string;
  authorRole: string;
  authorInitials: string;
  rating: number;
  createdAt: string;
  comment: string;
  verifiedPurchase: boolean;
}

export interface CourseCohortInfo {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  seatsTotal: number;
  seatsRemaining: number;
  timezone: string;
}

export interface CatalogCourse {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  description: string;
  category: CourseCategory;
  level: CourseLevel;
  deliveryMode: CourseDeliveryMode;
  language: CourseLanguageCode;
  languageLabel: string;
  priceMinor: number;
  compareAtPriceMinor?: number;
  currency: 'USD' | 'EUR';
  includedInSubscription: boolean;
  rating: number;
  reviewsCount: number;
  enrolledCount: number;
  totalDurationMinutes: number;
  lessonsCount: number;
  updatedAt: string;
  featured: boolean;
  accentPalette: {
    bg: string;
    text: string;
    border: string;
  };
  highlights: string[];
  prerequisites: string[];
  outcomes: string[];
  instructor: CourseInstructor;
  sections: CourseSection[];
  reviews: CourseReview[];
  upcomingCohort?: CourseCohortInfo;
}

export interface CatalogFilterParams {
  search?: string;
  category?: CourseCategory | 'ALL';
  level?: CourseLevel | 'ALL';
  price?: 'ALL' | 'FREE' | 'PAID';
  language?: CourseLanguageCode | 'ALL';
  deliveryMode?: CourseDeliveryMode | 'ALL';
  sort?: 'popular' | 'rating' | 'newest' | 'price-asc' | 'price-desc';
  page?: number;
  pageSize?: number;
}

export interface PaginatedCatalogResult {
  items: CatalogCourse[];
  meta: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export type ValuePropPersona = 'instructors' | 'academies' | 'students';

export interface ValuePropGroup {
  id: ValuePropPersona;
  label: string;
  badge: string;
  headline: string;
  description: string;
  metricLabel: string;
  metricValue: string;
  points: {
    title: string;
    detail: string;
  }[];
  ctaLabel: string;
  ctaHref: string;
}

export interface PricingPlan {
  id: string;
  name: string;
  audience: string;
  tagline: string;
  monthlyPriceMinor: number;
  annualPriceMinor: number;
  currency: 'USD';
  highlighted?: boolean;
  badge?: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
}

export interface Testimonial {
  id: string;
  quote: string;
  authorName: string;
  authorTitle: string;
  organization: string;
  persona: 'Instructor' | 'Academy' | 'Student';
  metric: string;
  initials: string;
}

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  category: 'Platform' | 'Commerce & Billing' | 'Learning Experience';
}
