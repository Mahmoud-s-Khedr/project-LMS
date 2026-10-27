import type { ReactNode } from 'react';
import { DashboardShell } from '@/features/shell';

export default function DashboardsLayout({ children }: { children: ReactNode }) {
  return <DashboardShell>{children}</DashboardShell>;
}
