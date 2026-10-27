import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AcademyProfile, fetchPublicWorkspace } from '@/features/catalog';

interface AcademyPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: AcademyPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const workspace = await fetchPublicWorkspace(slug);
    return {
      title: `${workspace.name} | Academy Profile`,
      description:
        workspace.description ||
        `Explore verified curriculum and cohorts taught by ${workspace.name}.`,
      openGraph: {
        title: `${workspace.name}`,
        description: workspace.description || undefined,
        images: workspace.logoUrl ? [{ url: workspace.logoUrl }] : undefined,
      },
    };
  } catch {
    return {
      title: 'Academy Not Found',
      description: 'The requested academy could not be found.',
    };
  }
}

export default async function AcademyPage({ params }: AcademyPageProps) {
  const { slug } = await params;
  try {
    const workspace = await fetchPublicWorkspace(slug);
    return <AcademyProfile workspace={workspace} />;
  } catch {
    notFound();
  }
}
