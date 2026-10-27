import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CourseDetail, findCatalogCourseBySlug } from '@/features/catalog';

interface CourseDetailPageProps {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ workspace?: string | string[] }>;
}

export async function generateMetadata({
  params,
  searchParams,
}: CourseDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const sParams = searchParams ? await searchParams : undefined;
  const rawWorkspace = sParams?.workspace;
  const workspace =
    typeof rawWorkspace === 'string'
      ? rawWorkspace
      : Array.isArray(rawWorkspace)
        ? rawWorkspace[0]
        : undefined;

  const course = await findCatalogCourseBySlug(slug, workspace);

  if (!course) {
    return {
      title: 'Course Not Found',
      description: 'The requested course could not be found.',
    };
  }

  return {
    title: `${course.title}`,
    description:
      course.summary ||
      `Learn ${course.title} with interactive exercises and verified credentials.`,
    openGraph: {
      title: `${course.title}`,
      description: course.summary || undefined,
      images: course.coverUrl ? [{ url: course.coverUrl }] : undefined,
    },
  };
}

export default async function CourseDetailPage({ params, searchParams }: CourseDetailPageProps) {
  const { slug } = await params;
  const sParams = searchParams ? await searchParams : undefined;
  const rawWorkspace = sParams?.workspace;
  const workspace =
    typeof rawWorkspace === 'string'
      ? rawWorkspace
      : Array.isArray(rawWorkspace)
        ? rawWorkspace[0]
        : undefined;

  const course = await findCatalogCourseBySlug(slug, workspace);

  if (!course) {
    notFound();
  }

  return <CourseDetail course={course} />;
}
