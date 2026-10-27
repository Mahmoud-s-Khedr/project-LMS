import type {
  CatalogCourse,
  CourseCategory,
  CourseLanguageCode,
  CourseLevel,
  FaqItem,
  PricingPlan,
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

export const MOCK_COURSES: CatalogCourse[] = [
  {
    id: 'crs_01_distributed_ts',
    slug: 'distributed-systems-in-typescript',
    title: 'Distributed Systems & Event-Driven Architecture in TypeScript',
    subtitle:
      'Design resilient queues, idempotent workflows, and outbox-backed microservices that survive production spikes.',
    summary:
      'A practical studio course covering transactional outboxes, BullMQ job orchestration, Redis locks, and observability in modern Node.js and NestJS systems.',
    description:
      'Most backend courses stop at CRUD endpoints. In real-world commerce and learning platforms, webhooks arrive twice, third-party APIs time out, and workers crash mid-flight. This course walks you step-by-step through architecting deterministic state machines, idempotent payment & enrollment pipelines, and zero-downtime schema evolutions with TypeScript, Prisma, and Redis.',
    category: 'Software Engineering',
    level: 'ADVANCED',
    deliveryMode: 'COHORT',
    language: 'en',
    languageLabel: 'English',
    priceMinor: 18900,
    compareAtPriceMinor: 24900,
    currency: 'USD',
    includedInSubscription: true,
    rating: 4.94,
    reviewsCount: 318,
    enrolledCount: 2480,
    totalDurationMinutes: 860,
    lessonsCount: 9,
    updatedAt: '2026-09-18',
    featured: true,
    accentPalette: {
      bg: 'bg-[#e1eee7] dark:bg-[#223428]',
      text: 'text-[#2d5a43] dark:text-[#a8d1b8]',
      border: 'border-[#bdd6c8] dark:border-[#34503e]',
    },
    highlights: [
      'Live architecture critiques & weekly cohort office hours',
      'Production-ready NestJS + BullMQ + Prisma reference monorepo',
      'Graded capstone assignment with line-by-line rubric feedback',
      'Verifiable completion certificate with unique QR verification',
    ],
    prerequisites: [
      'Working fluency with TypeScript and async/await',
      'Familiarity with relational databases (PostgreSQL preferred)',
      'Basic understanding of HTTP APIs and Docker Compose',
    ],
    outcomes: [
      'Implement transactional outbox and inbox patterns for exactly-once side effects',
      'Design idempotency keys and webhook signature verifiers that prevent double-charging',
      'Configure dead-letter queues, exponential backoff, and graceful worker shutdowns',
      'Instrument end-to-end distributed traces across HTTP requests and background workers',
    ],
    instructor: {
      id: 'inst_elena_rostova',
      name: 'Elena Rostova',
      headline: 'Principal Systems Architect · Former Staff Engineer at FinLedger',
      bio: 'Elena has spent 14 years building high-throughput ledger, billing, and education platforms across Europe and North America. She mentors staff engineers on distributed reliability and domain-driven boundaries.',
      avatarInitials: 'ER',
      credentials: [
        '14+ years in distributed backend engineering',
        'Author of "Deterministic Services in Node"',
        'Speaker at QCon & Strange Loop',
      ],
      coursesCount: 4,
      learnersCount: 9420,
      rating: 4.95,
    },
    upcomingCohort: {
      id: 'coh_autumn_2026',
      name: 'Cohort #11 · Autumn Studio',
      startsAt: '2026-11-09',
      endsAt: '2026-12-18',
      seatsTotal: 60,
      seatsRemaining: 14,
      timezone: 'UTC / Europe & Americas friendly',
    },
    sections: [
      {
        id: 'sec_01',
        title: 'Module 1 · Failure Modes & Idempotency Primitives',
        description:
          'Why distributed workflows fail silently and how to enforce deterministic retries at the boundary.',
        order: 1,
        lessons: [
          {
            id: 'les_01_01',
            title: 'Anatomy of a Partial Failure in Checkout & Fulfillment',
            kind: 'VIDEO',
            durationMinutes: 24,
            isFreePreview: true,
            summary:
              'Trace a real production incident where a network timeout caused duplicate entitlements and how state machines prevent it.',
          },
          {
            id: 'les_01_02',
            title: 'Designing Client & Webhook Idempotency Keys',
            kind: 'VIDEO',
            durationMinutes: 32,
            isFreePreview: true,
            summary:
              'Implement atomic request locking, payload hashing, and deterministic replay responses in PostgreSQL.',
          },
          {
            id: 'les_01_03',
            title: 'Failure Mode Identification Check',
            kind: 'QUIZ',
            durationMinutes: 15,
            isFreePreview: false,
            summary:
              'Timed 8-question diagnostic covering at-least-once delivery, lock expiration, and race conditions.',
          },
        ],
      },
      {
        id: 'sec_02',
        title: 'Module 2 · The Transactional Outbox & BullMQ Workers',
        description:
          'Bridging relational ACID transactions with asynchronous Redis job queues without dual-write bugs.',
        order: 2,
        lessons: [
          {
            id: 'les_02_01',
            title: 'The Dual-Write Anti-Pattern & Outbox Relay Architecture',
            kind: 'VIDEO',
            durationMinutes: 38,
            isFreePreview: false,
            dripDaysOffset: 7,
            summary:
              'Persist domain events inside the same database transaction and relay them reliably to BullMQ.',
          },
          {
            id: 'les_02_02',
            title: 'Graceful Draining, Concurrency Tuning & Dead-Letter Recovery',
            kind: 'ARTICLE',
            durationMinutes: 25,
            isFreePreview: false,
            dripDaysOffset: 7,
            summary:
              'Annotated reference guide for configuring worker concurrency, stalled job checks, and manual replay tooling.',
          },
          {
            id: 'les_02_03',
            title: 'Lab: Build an Idempotent Webhook & Outbox Processor',
            kind: 'ASSIGNMENT',
            durationMinutes: 120,
            isFreePreview: false,
            dripDaysOffset: 10,
            summary:
              'Submit your repository link and resilience test log for rubric-based evaluation by the teaching team.',
          },
        ],
      },
      {
        id: 'sec_03',
        title: 'Module 3 · Observability, Load Shedding & Live Architecture Review',
        description:
          'Measure queue latency, correlate request IDs, and defend against thundering herds.',
        order: 3,
        lessons: [
          {
            id: 'les_03_01',
            title: 'Propagating Correlation IDs Across HTTP & Worker Boundaries',
            kind: 'VIDEO',
            durationMinutes: 29,
            isFreePreview: false,
            dripDaysOffset: 14,
            summary:
              'Use AsyncLocalStorage and structured Pino logs to follow a user action from API gateway to email dispatch.',
          },
          {
            id: 'les_03_02',
            title: 'Live Studio Critique: Reviewing Cohort Capstone Designs',
            kind: 'LIVE_SESSION',
            durationMinutes: 90,
            isFreePreview: false,
            dripDaysOffset: 21,
            summary:
              'Interactive live session with architecture diagrams, Q&A, and recorded chapter markers.',
          },
          {
            id: 'les_03_03',
            title: 'Final Certification Assessment',
            kind: 'QUIZ',
            durationMinutes: 40,
            isFreePreview: false,
            dripDaysOffset: 28,
            summary:
              'Comprehensive scenario exam required to unlock your verifiable certificate of completion.',
          },
        ],
      },
    ],
    reviews: [
      {
        id: 'rev_01',
        authorName: 'Marcus Vance',
        authorRole: 'Senior Backend Engineer at Northstar Pay',
        authorInitials: 'MV',
        rating: 5,
        createdAt: '2026-09-02',
        comment:
          'The transactional outbox module alone saved our team weeks of debugging duplicate webhook side effects. The rubric feedback on the assignment was remarkably thorough.',
        verifiedPurchase: true,
      },
      {
        id: 'rev_02',
        authorName: 'Priya Nair',
        authorRole: 'Tech Lead at EdVantage',
        authorInitials: 'PN',
        rating: 5,
        createdAt: '2026-08-19',
        comment:
          'Finally a TypeScript course that treats backend engineering with the rigor it deserves. Clear diagrams, zero fluff, and realistic failure scenarios.',
        verifiedPurchase: true,
      },
    ],
  },
  {
    id: 'crs_02_design_systems',
    slug: 'editorial-design-systems-and-tokens',
    title: 'Editorial Design Systems: Typography, Color Tokens & Accessible UI',
    subtitle:
      'Craft distinctive, non-generic digital products from semantic CSS tokens to multi-brand component libraries.',
    summary:
      'Bridge the gap between Figma variables and production Tailwind CSS v4 + Radix primitives with WCAG AA contrast, fluid type scales, and tactile motion.',
    description:
      'Too many modern web applications look like clones of the same default template. In this self-paced studio course, you will learn how to establish a warm, unmistakable visual identity grounded in editorial typography, perceptual color spaces, keyboard-first accessibility, and resilient token architecture.',
    category: 'Design & Creative Systems',
    level: 'INTERMEDIATE',
    deliveryMode: 'SELF_PACED',
    language: 'en',
    languageLabel: 'English',
    priceMinor: 12900,
    compareAtPriceMinor: 16900,
    currency: 'USD',
    includedInSubscription: true,
    rating: 4.91,
    reviewsCount: 245,
    enrolledCount: 3890,
    totalDurationMinutes: 640,
    lessonsCount: 6,
    updatedAt: '2026-10-01',
    featured: true,
    accentPalette: {
      bg: 'bg-[#fbe8dc] dark:bg-[#38261d]',
      text: 'text-[#9e4720] dark:text-[#f3b699]',
      border: 'border-[#ecc8b3] dark:border-[#593a2b]',
    },
    highlights: [
      'Complete Figma token kit + Tailwind v4 CSS variable starter',
      'Deep dive into ARIA patterns, focus management, and screen-reader testing',
      'Lifetime access to all video lessons, essays, and component sandboxes',
      'Certificate of completion included',
    ],
    prerequisites: [
      'Comfortable with modern CSS (Flexbox, Grid, custom properties)',
      'Basic React component experience',
    ],
    outcomes: [
      'Architect 3-tier design tokens (primitive, semantic, component) for light and dark themes',
      'Pair serif display typefaces with geometric sans-serif UI fonts for scannable hierarchy',
      'Audit and remediate keyboard focus traps, contrast ratios, and live announcements',
      'Document component APIs that engineers and designers actually enjoy maintaining',
    ],
    instructor: {
      id: 'inst_soren_lindqvist',
      name: 'Soren Lindqvist',
      headline: 'Design Systems Director · Studio Nord',
      bio: 'Soren leads design systems and accessible interface architecture for editorial, publishing, and creative software brands in Stockholm and Berlin.',
      avatarInitials: 'SL',
      credentials: [
        'Former Staff Design Technologist at Atelier Press',
        'W3C ARIA Authoring Practices contributor',
        '11+ years shipping design systems',
      ],
      coursesCount: 3,
      learnersCount: 7810,
      rating: 4.92,
    },
    sections: [
      {
        id: 'sec_ds_01',
        title: 'Module 1 · Visual Identity & Typographic Rhythm',
        description:
          'Moving beyond sterile defaults using editorial grids, optical sizing, and deliberate whitespace.',
        order: 1,
        lessons: [
          {
            id: 'les_ds_01',
            title: 'Why Most SaaS Interfaces Feel Interchangeable',
            kind: 'VIDEO',
            durationMinutes: 21,
            isFreePreview: true,
            summary:
              'Deconstruct the visual traits of memorable software and establish your typographic scale.',
          },
          {
            id: 'les_ds_02',
            title: 'Semantic Color Tokens Across Light & Dark Surfaces',
            kind: 'VIDEO',
            durationMinutes: 35,
            isFreePreview: true,
            summary:
              'Design surface elevation, muted borders, and accent contrast without muddy dark modes.',
          },
          {
            id: 'les_ds_03',
            title: 'Token Architecture Workbook',
            kind: 'ARTICLE',
            durationMinutes: 18,
            isFreePreview: false,
            summary:
              'Reference naming conventions and CSS custom property mappings for multi-tenant apps.',
          },
        ],
      },
      {
        id: 'sec_ds_02',
        title: 'Module 2 · Accessible Interactive Primitives',
        description:
          'Roving tabindex, dialog focus restoration, and responsive touch targets down to 360px.',
        order: 2,
        lessons: [
          {
            id: 'les_ds_04',
            title: 'Keyboard Navigation & Focus Ring Craftsmanship',
            kind: 'VIDEO',
            durationMinutes: 28,
            isFreePreview: false,
            summary:
              'Build unmistakable focus indicators and test complex composite widgets with keyboard only.',
          },
          {
            id: 'les_ds_05',
            title: 'Accessibility Audit Quiz',
            kind: 'QUIZ',
            durationMinutes: 15,
            isFreePreview: false,
            summary:
              'Verify your mastery of ARIA roles, live regions, and WCAG 2.2 AA criteria.',
          },
          {
            id: 'les_ds_06',
            title: 'Project: Ship a Multi-Theme Component Specimen',
            kind: 'ASSIGNMENT',
            durationMinutes: 90,
            isFreePreview: false,
            summary:
              'Submit your token stylesheet and accessible component showcase for structured feedback.',
          },
        ],
      },
    ],
    reviews: [
      {
        id: 'rev_ds_01',
        authorName: 'Camille Laurent',
        authorRole: 'Staff Product Designer',
        authorInitials: 'CL',
        rating: 5,
        createdAt: '2026-09-25',
        comment:
          'This course completely changed how our design and frontend teams collaborate on tokens and dark mode surfaces.',
        verifiedPurchase: true,
      },
    ],
  },
  {
    id: 'crs_03_applied_llm_evals',
    slug: 'applied-ai-engineering-evals-and-rag',
    title: 'Applied AI Engineering: Retrieval Systems, Deterministic Evals & Guardrails',
    subtitle:
      'Go from brittle prompt prototypes to measurable, low-latency AI features with automated evaluation harnesses.',
    summary:
      'Learn hybrid search (pgvector + BM25), citation grounding, structured outputs, cost budgets, and CI evaluation pipelines.',
    description:
      'Shipping AI features in production requires systematic evaluation, latency budgeting, and strict data grounding. This course teaches software engineers how to build retrieval-augmented pipelines, measure precision and recall on golden datasets, and prevent hallucinations before they reach end users.',
    category: 'Data & AI',
    level: 'INTERMEDIATE',
    deliveryMode: 'COHORT',
    language: 'en',
    languageLabel: 'English',
    priceMinor: 21900,
    compareAtPriceMinor: 27900,
    currency: 'USD',
    includedInSubscription: true,
    rating: 4.89,
    reviewsCount: 194,
    enrolledCount: 1920,
    totalDurationMinutes: 780,
    lessonsCount: 6,
    updatedAt: '2026-10-10',
    featured: true,
    accentPalette: {
      bg: 'bg-[#e8e6fc] dark:bg-[#282542]',
      text: 'text-[#48389e] dark:text-[#c2b8f8]',
      border: 'border-[#cbc5f2] dark:border-[#403b69]',
    },
    highlights: [
      'Hands-on evaluation harness templates for CI/CD',
      'Hybrid search implementation with PostgreSQL + pgvector',
      'Bi-weekly live debugging clinics with the instructor',
      'Verifiable certificate upon passing final project',
    ],
    prerequisites: [
      'Proficiency in TypeScript or Python',
      'Basic familiarity with REST APIs and SQL',
    ],
    outcomes: [
      'Build golden evaluation datasets and automated assertion suites for LLM outputs',
      'Combine lexical search and vector embeddings with reciprocal rank fusion',
      'Enforce strict JSON schema validation and citation verification',
      'Implement token budgets, semantic caching, and fallback routing',
    ],
    instructor: {
      id: 'inst_devon_okafor',
      name: 'Dr. Devon Okafor',
      headline: 'Head of Applied AI · ContextLabs',
      bio: 'Devon holds a PhD in Information Retrieval and leads applied AI infrastructure teams building grounded search and tutoring assistants.',
      avatarInitials: 'DO',
      credentials: [
        'PhD in Information Retrieval',
        'Built search infrastructure serving 40M+ monthly queries',
        'Advisor to 6 AI-native developer tools',
      ],
      coursesCount: 2,
      learnersCount: 4650,
      rating: 4.9,
    },
    upcomingCohort: {
      id: 'coh_ai_nov_2026',
      name: 'Cohort #6 · Winter Lab',
      startsAt: '2026-11-16',
      endsAt: '2026-12-21',
      seatsTotal: 50,
      seatsRemaining: 9,
      timezone: 'UTC / Global live sessions',
    },
    sections: [
      {
        id: 'sec_ai_01',
        title: 'Module 1 · Evaluation-Driven Development',
        description:
          'Why you cannot improve what you cannot measure in non-deterministic systems.',
        order: 1,
        lessons: [
          {
            id: 'les_ai_01',
            title: 'Building Your First Golden Dataset & Scoring Rubric',
            kind: 'VIDEO',
            durationMinutes: 27,
            isFreePreview: true,
            summary:
              'Structure representative test cases, edge cases, and adversarial prompts.',
          },
          {
            id: 'les_ai_02',
            title: 'Deterministic vs. Model-Graded Assertions',
            kind: 'ARTICLE',
            durationMinutes: 20,
            isFreePreview: true,
            summary:
              'When to use exact schema checks, embedding similarity, or calibrated rubric judges.',
          },
          {
            id: 'les_ai_03',
            title: 'Eval Metrics Diagnostic',
            kind: 'QUIZ',
            durationMinutes: 15,
            isFreePreview: false,
            summary: 'Test your understanding of precision@k, recall, and faithfulness metrics.',
          },
        ],
      },
      {
        id: 'sec_ai_02',
        title: 'Module 2 · Hybrid Retrieval & Citation Grounding',
        description:
          'Chunking strategies, metadata filtering, and verifiable source attribution.',
        order: 2,
        lessons: [
          {
            id: 'les_ai_04',
            title: 'Document Chunking & Reciprocal Rank Fusion in Postgres',
            kind: 'VIDEO',
            durationMinutes: 36,
            isFreePreview: false,
            dripDaysOffset: 7,
            summary:
              'Combine full-text tsvector queries with vector cosine distance in a single SQL query.',
          },
          {
            id: 'les_ai_05',
            title: 'Live Clinic: Diagnosing Retrieval Misses',
            kind: 'LIVE_SESSION',
            durationMinutes: 75,
            isFreePreview: false,
            dripDaysOffset: 14,
            summary:
              'Interactive walkthrough of real failure traces and re-ranking techniques.',
          },
          {
            id: 'les_ai_06',
            title: 'Capstone: Grounded Course Q&A Assistant with Evals',
            kind: 'ASSIGNMENT',
            durationMinutes: 110,
            isFreePreview: false,
            dripDaysOffset: 21,
            summary:
              'Submit your evaluation report showing >=92% citation accuracy on the benchmark set.',
          },
        ],
      },
    ],
    reviews: [
      {
        id: 'rev_ai_01',
        authorName: 'Hannah Weber',
        authorRole: 'ML Engineer',
        authorInitials: 'HW',
        rating: 5,
        createdAt: '2026-10-03',
        comment:
          'Practical, hype-free, and focused on engineering fundamentals. Our RAG accuracy jumped 24% after implementing the hybrid search module.',
        verifiedPurchase: true,
      },
    ],
  },
  {
    id: 'crs_04_product_strategy_foundations',
    slug: 'product-discovery-and-outcome-roadmaps',
    title: 'Product Discovery & Outcome-Driven Roadmaps for Technical Leaders',
    subtitle:
      'Align engineering, design, and commercial teams around measurable customer outcomes instead of feature factories.',
    summary:
      'A free foundational course on structured customer interviews, opportunity solution trees, pricing experiments, and executive storytelling.',
    description:
      'Great technical execution means little if you build the wrong thing. This free open-access course introduces product engineers, founders, and new product managers to continuous discovery habits, evidence-backed prioritization, and clear roadmap communication.',
    category: 'Product & Leadership',
    level: 'BEGINNER',
    deliveryMode: 'SELF_PACED',
    language: 'en',
    languageLabel: 'English',
    priceMinor: 0,
    currency: 'USD',
    includedInSubscription: true,
    rating: 4.86,
    reviewsCount: 412,
    enrolledCount: 6340,
    totalDurationMinutes: 240,
    lessonsCount: 4,
    updatedAt: '2026-09-12',
    featured: true,
    accentPalette: {
      bg: 'bg-[#eee9d8] dark:bg-[#333022]',
      text: 'text-[#695a26] dark:text-[#dfd098]',
      border: 'border-[#ddd3b4] dark:border-[#4f4932]',
    },
    highlights: [
      '100% Free open-enrollment foundational course',
      'Downloadable interview scripts and opportunity tree templates',
      'Self-paced video lessons + interactive comprehension checks',
      'Instant access upon creating a free student account',
    ],
    prerequisites: ['No prior product management experience required'],
    outcomes: [
      'Conduct unbiased customer discovery interviews that uncover real workflow friction',
      'Translate broad business goals into measurable product outcomes',
      'Run lightweight willingness-to-pay and packaging validation tests',
      'Write crisp 1-page product briefs that engineers love reading',
    ],
    instructor: {
      id: 'inst_claire_mercier',
      name: 'Claire Mercier',
      headline: 'VP of Product · Canopy Workspaces',
      bio: 'Claire has scaled B2B and creator economy products from seed stage to $80M ARR and coaches technical founders on product strategy.',
      avatarInitials: 'CM',
      credentials: [
        'VP of Product at Canopy Workspaces',
        'Mentor at First Round & Seedcamp',
        '12+ years in B2B SaaS product leadership',
      ],
      coursesCount: 2,
      learnersCount: 8900,
      rating: 4.88,
    },
    sections: [
      {
        id: 'sec_pm_01',
        title: 'Module 1 · Continuous Discovery Fundamentals',
        description: 'Moving from output roadmaps to evidence-based opportunity mapping.',
        order: 1,
        lessons: [
          {
            id: 'les_pm_01',
            title: 'Escaping the Feature Factory Mindset',
            kind: 'VIDEO',
            durationMinutes: 19,
            isFreePreview: true,
            summary: 'How high-performing product trios frame problems before sketching solutions.',
          },
          {
            id: 'les_pm_02',
            title: 'Customer Interviewing Without Leading Questions',
            kind: 'VIDEO',
            durationMinutes: 26,
            isFreePreview: true,
            summary: 'Concrete scripts for eliciting specific past stories instead of vague opinions.',
          },
          {
            id: 'les_pm_03',
            title: 'The One-Page Opportunity Brief Template',
            kind: 'ARTICLE',
            durationMinutes: 15,
            isFreePreview: true,
            summary: 'Copy-ready markdown template for aligning stakeholders.',
          },
          {
            id: 'les_pm_04',
            title: 'Discovery Synthesis Check',
            kind: 'QUIZ',
            durationMinutes: 12,
            isFreePreview: true,
            summary: 'Verify key concepts from Module 1.',
          },
        ],
      },
    ],
    reviews: [
      {
        id: 'rev_pm_01',
        authorName: 'David Kim',
        authorRole: 'Founding Engineer',
        authorInitials: 'DK',
        rating: 5,
        createdAt: '2026-09-14',
        comment:
          'Unbelievable value for a free course. We adopted the one-page opportunity brief across our entire engineering org.',
        verifiedPurchase: true,
      },
    ],
  },
  {
    id: 'crs_05_arquitectura_web_es',
    slug: 'arquitectura-frontend-moderna-nextjs',
    title: 'Arquitectura Frontend Moderna con Next.js 15, React 19 y TypeScript',
    subtitle:
      'Construye aplicaciones web rápidas, accesibles y modulares listas para equipos de alto rendimiento.',
    summary:
      'Domina Server Components, caché granular, formularios tipados con Zod y pruebas automatizadas con Vitest.',
    description:
      'Un curso práctico en español diseñado para desarrolladores frontend y full-stack que desean estructurar aplicaciones empresariales escalables con Next.js App Router, patrones de dominio limpio y excelente experiencia de usuario.',
    category: 'Software Engineering',
    level: 'INTERMEDIATE',
    deliveryMode: 'SELF_PACED',
    language: 'es',
    languageLabel: 'Español',
    priceMinor: 9900,
    compareAtPriceMinor: 13900,
    currency: 'USD',
    includedInSubscription: true,
    rating: 4.93,
    reviewsCount: 167,
    enrolledCount: 2150,
    totalDurationMinutes: 540,
    lessonsCount: 4,
    updatedAt: '2026-09-29',
    featured: false,
    accentPalette: {
      bg: 'bg-[#e1eee7] dark:bg-[#223428]',
      text: 'text-[#2d5a43] dark:text-[#a8d1b8]',
      border: 'border-[#bdd6c8] dark:border-[#34503e]',
    },
    highlights: [
      '100% en Español con código fuente completo',
      'Patrones de arquitectura por features y pruebas unitarias',
      'Certificado verificable al finalizar',
    ],
    prerequisites: ['Conocimientos base de React y TypeScript'],
    outcomes: [
      'Diseñar fronteras claras entre Server y Client Components',
      'Gestionar estado del servidor con TanStack Query y validación Zod',
      'Implementar accesibilidad WCAG AA y diseño responsivo',
    ],
    instructor: {
      id: 'inst_mateo_salazar',
      name: 'Mateo Salazar',
      headline: 'Staff Frontend Architect · Río Digital',
      bio: 'Mateo lidera equipos de arquitectura web en Latinoamérica y Europa, especializado en rendimiento web y sistemas de diseño.',
      avatarInitials: 'MS',
      credentials: ['10+ años en desarrollo web', 'Mentor de ingeniería frontend'],
      coursesCount: 2,
      learnersCount: 3400,
      rating: 4.93,
    },
    sections: [
      {
        id: 'sec_es_01',
        title: 'Módulo 1 · Fundamentos de Arquitectura Modular',
        description: 'Organización por dominios, contratos estrictos y rutas protegidas.',
        order: 1,
        lessons: [
          {
            id: 'les_es_01',
            title: 'Estructura por Features y Límites de Módulo',
            kind: 'VIDEO',
            durationMinutes: 25,
            isFreePreview: true,
            summary: 'Cómo escalar un repositorio frontend sin acoplamiento accidental.',
          },
          {
            id: 'les_es_02',
            title: 'Formularios Resilientes con React Hook Form y Zod',
            kind: 'VIDEO',
            durationMinutes: 30,
            isFreePreview: false,
            summary: 'Validación cliente/servidor y manejo accesible de errores.',
          },
          {
            id: 'les_es_03',
            title: 'Evaluación de Arquitectura',
            kind: 'QUIZ',
            durationMinutes: 15,
            isFreePreview: false,
            summary: 'Comprueba los conceptos clave del módulo.',
          },
          {
            id: 'les_es_04',
            title: 'Proyecto Práctico: Dashboard Modular',
            kind: 'ASSIGNMENT',
            durationMinutes: 90,
            isFreePreview: false,
            summary: 'Entrega tu implementación para revisión detallada.',
          },
        ],
      },
    ],
    reviews: [
      {
        id: 'rev_es_01',
        authorName: 'Lucía Fernández',
        authorRole: 'Frontend Developer',
        authorInitials: 'LF',
        rating: 5,
        createdAt: '2026-10-01',
        comment: 'Explicaciones clarísimas y ejemplos que reflejan problemas reales de producción.',
        verifiedPurchase: true,
      },
    ],
  },
  {
    id: 'crs_06_data_storytelling_de',
    slug: 'datenvisualisierung-und-produktmetriken',
    title: 'Datenvisualisierung & Produktmetriken für Entscheidungsfinder',
    subtitle:
      'Verwandeln Sie komplexe Rohdaten in präzise, handlungsorientierte Geschichten und Dashboards.',
    summary:
      'Ein praxisnaher Kurs über Kohortenanalysen, Metrik-Hierarchien und klare visuelle Kommunikation.',
    description:
      'Lernen Sie, wie man aussagekräftige Produkt- und Lernmetriken definiert, häufige statistische Fehlschlüsse vermeidet und übersichtliche Berichte gestaltet.',
    category: 'Data & AI',
    level: 'BEGINNER',
    deliveryMode: 'SELF_PACED',
    language: 'de',
    languageLabel: 'Deutsch',
    priceMinor: 0,
    currency: 'EUR',
    includedInSubscription: true,
    rating: 4.84,
    reviewsCount: 88,
    enrolledCount: 1410,
    totalDurationMinutes: 210,
    lessonsCount: 3,
    updatedAt: '2026-08-28',
    featured: false,
    accentPalette: {
      bg: 'bg-[#e8e6fc] dark:bg-[#282542]',
      text: 'text-[#48389e] dark:text-[#c2b8f8]',
      border: 'border-[#cbc5f2] dark:border-[#403b69]',
    },
    highlights: [
      'Kostenloser Einstiegskurs auf Deutsch',
      'Praxisnahe Vorlagen für Kohorten- und Retention-Analysen',
    ],
    prerequisites: ['Keine Vorkenntnisse in Programmierung erforderlich'],
    outcomes: [
      'Nordstern-Metriken und führende Indikatoren sauber definieren',
      'Kohorten-Retention lesen und interpretieren',
    ],
    instructor: {
      id: 'inst_lukas_braun',
      name: 'Lukas Braun',
      headline: 'Lead Analytics Engineer · Berlin Data Collective',
      bio: 'Lukas berät europäische Technologieunternehmen beim Aufbau moderner Analytics-Stacks.',
      avatarInitials: 'LB',
      credentials: ['9+ Jahre in Data Analytics & BI'],
      coursesCount: 1,
      learnersCount: 1410,
      rating: 4.84,
    },
    sections: [
      {
        id: 'sec_de_01',
        title: 'Modul 1 · Metrik-Design & Visuelle Klarheit',
        description: 'Grundlagen für klare Entscheidungen.',
        order: 1,
        lessons: [
          {
            id: 'les_de_01',
            title: 'Vanity Metrics vs. Handlungsrelevante Kennzahlen',
            kind: 'VIDEO',
            durationMinutes: 22,
            isFreePreview: true,
            summary: 'Wie Teams die richtigen Fragen an ihre Daten stellen.',
          },
          {
            id: 'les_de_02',
            title: 'Kohortenanalyse Schritt für Schritt',
            kind: 'ARTICLE',
            durationMinutes: 18,
            isFreePreview: true,
            summary: 'Praxisleitfaden zur Messung von Lernerfolg und Kundenbindung.',
          },
          {
            id: 'les_de_03',
            title: 'Abschlussquiz: Produktmetriken',
            kind: 'QUIZ',
            durationMinutes: 12,
            isFreePreview: true,
            summary: 'Überprüfen Sie Ihr Wissen.',
          },
        ],
      },
    ],
    reviews: [],
  },
];

export const VALUE_PROP_GROUPS: ValuePropGroup[] = [
  {
    id: 'instructors',
    label: 'For Independent Instructors',
    badge: 'CREATOR STUDIO',
    headline: 'Turn deep expertise into a flagship learning product—without stitching five tools together.',
    description:
      'Publish self-paced courses or high-touch cohorts with video lessons, drip schedules, graded assignments, coupons, and instant Stripe payouts.',
    metricLabel: 'Curriculum builder',
    metricValue: 'Structured modular authoring workflow',
    points: [
      {
        title: 'Rich Multi-Modal Curriculum Builder',
        detail:
          'Combine video lessons, long-form editorial articles, timed quizzes, rubric assignments, and live cohort sessions in one structured outline.',
      },
      {
        title: 'Built-In Commerce & Global Tax Compliance',
        detail:
          'Sell one-time enrollments, bundles, or recurring memberships with promotional coupons, regional pricing, and automated PDF invoices.',
      },
      {
        title: 'Actionable Learner Analytics',
        detail:
          'See exact lesson drop-off points, video completion heatmaps, and quiz item difficulty so you can continuously refine your teaching.',
      },
    ],
    ctaLabel: 'Start teaching',
    ctaHref: '/register?role=instructor',
  },
  {
    id: 'academies',
    label: 'For Multi-Instructor Academies',
    badge: 'TEAM & ACADEMY WORKSPACES',
    headline: 'Run an entire school or training organization with granular roles and shared standards.',
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
        detail:
          'Run parallel cohorts with capacity limits, relative or calendar-based module unlocking, and automated reminder digests.',
      },
      {
        title: 'Verifiable Branded Certificates',
        detail:
          'Automatically generate tamper-evident PDF certificates with unique verification URLs and QR codes the moment completion rules are met.',
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
    description:
      'Pick up right where you left off across devices with synced video timestamps, timestamped personal notes, interactive discussions, and mentor feedback.',
    metricLabel: 'Cohort experience',
    metricValue: 'Structured pacing and community accountability',
    points: [
      {
        title: 'Precision Video Player & Synced Notes',
        detail:
          'Keyboard-first playback controls, variable speed, chapter markers, captions, and markdown notes anchored to exact video timestamps.',
      },
      {
        title: 'Direct Rubric Feedback from Practitioners',
        detail:
          'Submit real projects and receive structured criterion-by-criterion feedback from instructors and teaching assistants.',
      },
      {
        title: 'Proof of Work You Can Share',
        detail:
          'Earn cryptographically verifiable certificates and showcase completed capstones directly to employers or clients.',
      },
    ],
    ctaLabel: 'Browse the course catalog',
    ctaHref: '/courses',
  },
];

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'plan_learner_pass',
    name: 'Learner All-Access Pass',
    audience: 'For individual learners & practitioners',
    tagline: 'Unlimited access to all subscription-eligible self-paced courses and community threads.',
    monthlyPriceMinor: 3900,
    annualPriceMinor: 2900,
    currency: 'USD',
    features: [
      'Unlimited access to 40+ self-paced studio courses',
      'Synced playback progress, bookmarks & timestamped notes',
      'Interactive quizzes, coding labs & completion certificates',
      '15% member discount on live cohort enrollments',
    ],
    ctaLabel: 'Start 7-day free trial',
    ctaHref: '/register',
  },
  {
    id: 'plan_creator_pro',
    name: 'Creator Studio',
    audience: 'For independent instructors & subject-matter experts',
    tagline: 'Everything required to author, market, and monetize flagship courses and cohorts.',
    monthlyPriceMinor: 7900,
    annualPriceMinor: 6400,
    currency: 'USD',
    highlighted: true,
    badge: 'MOST POPULAR',
    features: [
      'Unlimited published courses, cohorts & streaming video lessons',
      '0% platform fee on direct sales (standard Stripe processing only)',
      'Quizzes, rubric assignments, coupons & automated certificates',
      'Detailed enrollment funnel & lesson retention analytics',
    ],
    ctaLabel: 'Launch your studio',
    ctaHref: '/register?role=instructor',
  },
  {
    id: 'plan_academy',
    name: 'Academy Workspace',
    audience: 'For schools, bootcamps & training organizations',
    tagline: 'Multi-instructor governance, dedicated TA grading queues, and custom academy branding.',
    monthlyPriceMinor: 24900,
    annualPriceMinor: 19900,
    currency: 'USD',
    features: [
      'Up to 25 instructor & teaching assistant seats included',
      'Role-based access control & immutable compliance audit logs',
      'Custom certificate templates & webhook/API integrations',
      'Priority onboarding & dedicated technical account support',
    ],
    ctaLabel: 'Create Academy account',
    ctaHref: '/register?role=instructor',
  },
];

export const TESTIMONIALS: Testimonial[] = [];

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'faq_01',
    category: 'Learning Experience',
    question: 'What is the difference between Self-Paced courses and Cohort courses?',
    answer:
      'Self-paced courses unlock immediately upon enrollment so you can study on your own schedule with lifetime access to updates. Cohort courses run on a structured calendar with a peer group, featuring scheduled module releases (drip), live interactive studio sessions, and personalized rubric grading from instructors and teaching assistants.',
  },
  {
    id: 'faq_02',
    category: 'Commerce & Billing',
    question: 'Can I buy a single course without subscribing, or switch to a subscription later?',
    answer:
      'Yes. Every course lists its one-time purchase price clearly, which grants permanent access to that course version and its certificate. If you prefer broad access across our catalog, the Learner All-Access Pass unlocks all subscription-eligible courses for a flat monthly or annual fee, and you can cancel anytime from your billing settings.',
  },
  {
    id: 'faq_03',
    category: 'Platform',
    question: 'How do verifiable certificates work?',
    answer:
      'When you complete 100% of required lessons and pass any required graded quizzes or capstone assignments, the platform automatically generates a tamper-evident PDF certificate with a unique serial code and QR verification URL (/verify/:code) that employers can validate in one click.',
  },
  {
    id: 'faq_04',
    category: 'Commerce & Billing',
    question: 'How do payouts and taxes work for instructors and academies?',
    answer:
      'Instructors connect their Stripe account in minutes. When a student purchases your course or cohort seat, the platform records an immutable ledger entry, generates a compliant invoice, and routes payouts directly to your bank account while handling promotional coupons and refund revocations automatically.',
  },
  {
    id: 'faq_05',
    category: 'Platform',
    question: 'Can one account both take courses as a student and teach as an instructor?',
    answer:
      'Absolutely. Your account supports both platform-wide learner capabilities and workspace-scoped roles (Student, Teaching Assistant, Instructor, or Admin). You can switch effortlessly between the Student, Instructor, and Admin dashboards from the sidebar switcher.',
  },
];
