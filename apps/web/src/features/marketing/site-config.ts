export interface SiteStat {
  id?: string;
  label: string;
  value: string;
  description?: string;
}

export interface SiteTestimonial {
  id: string;
  quote: string;
  authorName: string;
  authorTitle: string;
  organization?: string;
  persona?: 'Instructor' | 'Academy' | 'Student' | string;
  metric?: string;
  rating?: number;
  initials?: string;
}

export interface SiteConfig {
  name: string;
  tagline: string;
  description: string;
  footerLegalName: string;
  stats?: SiteStat[];
  testimonials?: SiteTestimonial[];
}

const siteName = process.env.NEXT_PUBLIC_SITE_NAME || 'LMS';

export const siteConfig: SiteConfig = {
  name: siteName,
  tagline: 'Studio Courses, Live Cohorts & Creator Workspaces',
  description:
    'Depth for learners. Sovereignty for educators. Explore practitioner-led courses, live cohorts, and academy workspaces.',
  footerLegalName: siteName,
  stats: [],
  testimonials: [],
};

export function createSiteConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    ...siteConfig,
    ...overrides,
    stats: overrides.stats ?? siteConfig.stats,
    testimonials: overrides.testimonials ?? siteConfig.testimonials,
  };
}
