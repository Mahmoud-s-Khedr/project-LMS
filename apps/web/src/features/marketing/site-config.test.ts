import { describe, it, expect } from 'vitest';
import { siteConfig, createSiteConfig } from './site-config';

describe('siteConfig module', () => {
  it('provides default configuration with neutral LMS brand and empty stats/testimonials', () => {
    expect(siteConfig.name).toBe('LMS');
    expect(siteConfig.tagline).toBe('Studio Courses, Live Cohorts & Creator Workspaces');
    expect(siteConfig.footerLegalName).toBe('LMS');
    expect(siteConfig.stats).toEqual([]);
    expect(siteConfig.testimonials).toEqual([]);
  });

  it('allows customizing configuration with createSiteConfig', () => {
    const custom = createSiteConfig({
      name: 'Acme Academy',
      footerLegalName: 'Acme Academy LLC',
      stats: [{ label: 'Active Learners', value: '1,200' }],
      testimonials: [
        {
          id: 't-1',
          quote: 'Practical and thorough curriculum.',
          authorName: 'Alex Smith',
          authorTitle: 'Staff Engineer',
          organization: 'Acme Corp',
        },
      ],
    });

    expect(custom.name).toBe('Acme Academy');
    expect(custom.footerLegalName).toBe('Acme Academy LLC');
    expect(custom.stats).toHaveLength(1);
    expect(custom.stats?.[0]?.label).toBe('Active Learners');
    expect(custom.testimonials).toHaveLength(1);
    expect(custom.testimonials?.[0]?.authorName).toBe('Alex Smith');
  });
});
