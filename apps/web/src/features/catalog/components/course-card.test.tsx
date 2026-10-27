import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { catalogFixture, fixtureIds } from '@lms/shared';
import { CourseCard } from './course-card';
import type { PublicCourse } from '../types';

describe('CourseCard component', () => {
  const baseCourse: PublicCourse = catalogFixture.data[0]!;

  it('renders course title, summary, language, and links to course slug', () => {
    render(<CourseCard course={baseCourse} />);

    expect(screen.getByText('Reliable software')).toBeInTheDocument();
    expect(screen.getByText('An independent instructor course.')).toBeInTheDocument();
    expect(screen.getByText('Free')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view course/i })).toHaveAttribute(
      'href',
      '/courses/reliable-software',
    );
  });

  it('renders cohort delivery badge when deliveryMode is COHORT', () => {
    const cohortCourse: PublicCourse = {
      ...baseCourse,
      id: fixtureIds.course,
      deliveryMode: 'COHORT',
      isFree: false,
    };

    render(<CourseCard course={cohortCourse} />);

    expect(screen.getByText('Live Cohort')).toBeInTheDocument();
    expect(screen.getByText('Enrollment Open')).toBeInTheDocument();
  });

  it('renders cover image when coverUrl is provided', () => {
    const courseWithCover: PublicCourse = {
      ...baseCourse,
      coverUrl: 'https://images.local/cover.jpg',
    };

    render(<CourseCard course={courseWithCover} />);

    const img = screen.getByRole('img', { name: 'Reliable software' });
    expect(img).toHaveAttribute('src', 'https://images.local/cover.jpg');
  });

  it('builds course links with workspace query param when workspaceSlug is provided', () => {
    render(<CourseCard course={baseCourse} workspaceSlug="acme-academy" />);

    expect(screen.getByRole('link', { name: /view course/i })).toHaveAttribute(
      'href',
      '/courses/reliable-software?workspace=acme-academy',
    );
    expect(screen.getByRole('link', { name: 'Reliable software' })).toHaveAttribute(
      'href',
      '/courses/reliable-software?workspace=acme-academy',
    );
  });

  it('builds course links with workspace query param from course property', () => {
    const courseWithWs = {
      ...baseCourse,
      workspaceSlug: 'engineering-hub',
    };

    render(<CourseCard course={courseWithWs} />);

    expect(screen.getByRole('link', { name: /view course/i })).toHaveAttribute(
      'href',
      '/courses/reliable-software?workspace=engineering-hub',
    );
  });
});
