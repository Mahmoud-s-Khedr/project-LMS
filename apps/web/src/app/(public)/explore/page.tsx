import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Explore Courses & Cohorts',
  description:
    'Explore practitioner-led courses, live cohort programs, and technical certifications.',
};

export default function ExplorePage() {
  redirect('/courses');
}
