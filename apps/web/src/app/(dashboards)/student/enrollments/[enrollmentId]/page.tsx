'use client';

import * as React from 'react';
import { EnrollmentDetailView } from '@/features/student';

interface EnrollmentDetailPageProps {
  params: Promise<{ enrollmentId: string }>;
}

export default function EnrollmentDetailPage({ params }: EnrollmentDetailPageProps) {
  const unwrappedParams = React.use(params);
  const { enrollmentId } = unwrappedParams;

  return (
    <div className="pb-10">
      <EnrollmentDetailView enrollmentId={enrollmentId} />
    </div>
  );
}
