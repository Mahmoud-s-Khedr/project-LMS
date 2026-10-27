import type * as React from 'react';
import {
  Award,
  BarChart3,
  BookOpen,
  Calendar,
  ClipboardCheck,
  CreditCard,
  FileCheck2,
  FolderKanban,
  LayoutDashboard,
  MessageSquare,
  Receipt,
  Settings,
  ShieldAlert,
  ShieldCheck,
  TicketPercent,
  Users,
} from 'lucide-react';
import type { NavIconName } from '../config/nav-config';

const ICON_COMPONENTS: Record<NavIconName, React.ComponentType<{ className?: string }>> = {
  overview: LayoutDashboard,
  courses: BookOpen,
  cohorts: Calendar,
  assignments: FileCheck2,
  certificates: Award,
  discussions: MessageSquare,
  curriculum: FolderKanban,
  grading: ClipboardCheck,
  analytics: BarChart3,
  payouts: CreditCard,
  coupons: TicketPercent,
  users: Users,
  moderation: ShieldAlert,
  orders: Receipt,
  audit: ShieldCheck,
  settings: Settings,
};

export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const Icon = ICON_COMPONENTS[name] ?? LayoutDashboard;
  return <Icon className={className} aria-hidden="true" />;
}
