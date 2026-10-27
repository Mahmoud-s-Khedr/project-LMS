import type {
  CatalogCourse,
  CourseCategory,
  CourseLanguageCode,
  CourseLevel,
  FaqItem,
  Testimonial,
  ValuePropGroup,
} from './types';

export const COURSE_CATEGORIES: readonly CourseCategory[] = [
  'Software Engineering',
  'Design & Creative Systems',
  'Data & AI',
  'Product & Leadership',
] as const;

export const COURSE_LEVELS: readonly { value: CourseLevel; label: string }[] = [
  { value: 'BEGINNER', label: 'Beginner' },
  { value: 'INTERMEDIATE', label: 'Intermediate' },
  { value: 'ADVANCED', label: 'Advanced' },
] as const;

export const COURSE_LANGUAGES: readonly { value: CourseLanguageCode; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Español' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
] as const;

export const MOCK_COURSES: CatalogCourse[] = [];

export const VALUE_PROP_GROUPS: ValuePropGroup[] = [
  {
    id: 'instructors',
    label: 'For Independent Instructors',
    badge: 'CREATOR STUDIO',
    headline:
      'Turn deep expertise into a flagship learning product—without stitching five tools together.',
    description: 'Publish courses with lessons, release schedules, assessments, and coupons.',
    metricLabel: 'Curriculum builder',
    metricValue: 'Structured modular authoring workflow',
    points: [
      {
        title: 'Rich Multi-Modal Curriculum Builder',
        detail:
          'Combine video lessons, long-form editorial articles, timed quizzes, rubric assignments, and live cohort sessions in one structured outline.',
      },
      {
        title: 'Built-In Commerce',
        detail: 'Offer course products and subscriptions with promotional coupons.',
      },
      {
        title: 'Actionable Learner Analytics',
        detail: 'Review learner progress and course reports.',
      },
    ],
    ctaLabel: 'Start teaching',
    ctaHref: '/register?role=instructor',
  },
  {
    id: 'academies',
    label: 'For Multi-Instructor Academies',
    badge: 'TEAM & ACADEMY WORKSPACES',
    headline:
      'Run an entire school or training organization with granular roles and shared standards.',
    description:
      'Invite co-instructors and teaching assistants, manage multiple cohort tracks simultaneously, and issue verifiable credentials under your academy brand.',
    metricLabel: 'Grading & operations',
    metricValue: 'Dedicated TA queues and shared rubric evaluation',
    points: [
      {
        title: 'Role-Scoped Workspace Governance',
        detail:
          'Assign Workspace Admins, Instructors, and Teaching Assistants with strict resource-level permissions and audit logging.',
      },
      {
        title: 'Cohort Scheduling & Drip Automation',
        detail: 'Run cohorts with capacity limits and scheduled lesson releases.',
      },
      {
        title: 'Verifiable Branded Certificates',
        detail:
          'Issue PDF certificates with verification links when completion requirements are met.',
      },
    ],
    ctaLabel: 'Explore Academy workspaces',
    ctaHref: '/register?role=instructor',
  },
  {
    id: 'students',
    label: 'For Ambitious Learners',
    badge: 'DISTRACTION-FREE LEARNING',
    headline: 'A calm, tactile study environment engineered for real skill mastery and retention.',
    description: 'Track your progress, complete assessments, and receive instructor feedback.',
    metricLabel: 'Cohort experience',
    metricValue: 'Structured pacing and community accountability',
    points: [
      {
        title: 'Lesson Progress',
        detail: 'Follow lessons and track your progress through a course.',
      },
      {
        title: 'Direct Rubric Feedback from Practitioners',
        detail:
          'Submit real projects and receive structured criterion-by-criterion feedback from instructors and teaching assistants.',
      },
      {
        title: 'Proof of Work You Can Share',
        detail:
          'Earn certificates with a public verification link when course requirements are met.',
      },
    ],
    ctaLabel: 'Browse the course catalog',
    ctaHref: '/courses',
  },
];

export const TESTIMONIALS: Testimonial[] = [];

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'faq_01',
    category: 'Learning Experience',
    question: 'What is the difference between Self-Paced courses and Cohort courses?',
    answer:
      'Self-paced courses can be studied on your own schedule. Cohort courses may have scheduled releases and live sessions. Access and release rules depend on the course.',
  },
  {
    id: 'faq_02',
    category: 'Commerce & Billing',
    question: 'Can I buy a single course without subscribing, or switch to a subscription later?',
    answer:
      'Available products and prices are shown in the catalog. Access depends on the product purchased; some products are subscriptions.',
  },
  {
    id: 'faq_03',
    category: 'Platform',
    question: 'How do verifiable certificates work?',
    answer:
      'When the course completion requirements are met, a certificate may be issued with a public verification link.',
  },
  {
    id: 'faq_04',
    category: 'Commerce & Billing',
    question: 'How are payments handled?',
    answer:
      'Payments are processed through the platform Stripe account. Instructor payouts and tax calculation are not currently supported.',
  },
  {
    id: 'faq_05',
    category: 'Platform',
    question: 'Can one account both take courses as a student and teach as an instructor?',
    answer:
      'An account can learn and hold workspace roles such as instructor or teaching assistant. Available dashboards depend on your roles.',
  },
];
