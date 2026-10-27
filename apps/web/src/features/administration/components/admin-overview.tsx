'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Building2,
  FileText,
  RotateCw,
  ShieldCheck,
  Users,
  Webhook,
} from 'lucide-react';
import { siteConfig } from '@/features/marketing/site-config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useActiveWorkspace } from '@/features/workspaces';
import {
  useAdminUsersQuery,
  useAdminWorkspacesQuery,
  useAuditLogsQuery,
  useOperationsEventsQuery,
  useWebhooksQuery,
} from '../hooks';

export function AdminOverview() {
  const { activeWorkspaceId } = useActiveWorkspace();

  const { data: usersData, isLoading: isLoadingUsers } = useAdminUsersQuery({
    page: 1,
    pageSize: 1,
  });
  const { data: workspacesData, isLoading: isLoadingWorkspaces } = useAdminWorkspacesQuery({
    page: 1,
    pageSize: 1,
  });
  const { data: operationsData, isLoading: isLoadingOperations } = useOperationsEventsQuery(
    activeWorkspaceId ?? '',
    { status: 'DEAD' },
    { enabled: Boolean(activeWorkspaceId) },
  );
  const { data: webhooksData, isLoading: isLoadingWebhooks } = useWebhooksQuery({
    page: 1,
    pageSize: 1,
    status: 'FAILED',
  });
  const { data: recentAudit, isLoading: isLoadingAudit } = useAuditLogsQuery(
    activeWorkspaceId ?? '',
    undefined,
    { enabled: Boolean(activeWorkspaceId) },
  );

  const totalUsers = usersData?.meta.total ?? 0;
  const totalWorkspaces = workspacesData?.meta.total ?? 0;
  const failedEventsCount = operationsData?.data.length ?? 0;
  const failedWebhooksCount = webhooksData?.meta.total ?? 0;

  return (
    <div className="space-y-6">
      {/* Title & Brand Intro */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {siteConfig.name} Platform Administration
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Platform governance, tenant inventory, compliance audit trails, and resilient operational pipelines.
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Platform Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoadingUsers ? '...' : totalUsers.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total registered accounts</p>
            <div className="mt-3">
              <Button variant="ghost" size="sm" asChild className="p-0 h-auto text-xs font-medium">
                <Link href="/admin/users" className="flex items-center gap-1 text-primary">
                  Manage accounts <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Active Tenants</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoadingWorkspaces ? '...' : totalWorkspaces.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Personal & Academy workspaces</p>
            <div className="mt-3">
              <Button variant="ghost" size="sm" asChild className="p-0 h-auto text-xs font-medium">
                <Link href="/admin/workspaces" className="flex items-center gap-1 text-primary">
                  Tenant governance <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Stalled Outbox Events</CardTitle>
            <RotateCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{isLoadingOperations ? '...' : failedEventsCount}</div>
              {failedEventsCount > 0 ? (
                <Badge variant="destructive" className="text-[10px]">
                  Action Needed
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                  Healthy
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Failed delivery projections</p>
            <div className="mt-3">
              <Button variant="ghost" size="sm" asChild className="p-0 h-auto text-xs font-medium">
                <Link href="/admin/operations" className="flex items-center gap-1 text-primary">
                  Operations queue <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/40 transition-colors">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Failed Webhooks</CardTitle>
            <Webhook className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="text-2xl font-bold">{isLoadingWebhooks ? '...' : failedWebhooksCount}</div>
              {failedWebhooksCount > 0 ? (
                <Badge variant="destructive" className="text-[10px]">
                  Unresolved
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                  Clean
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Stripe ingestion failures</p>
            <div className="mt-3">
              <Button variant="ghost" size="sm" asChild className="p-0 h-auto text-xs font-medium">
                <Link href="/admin/operations" className="flex items-center gap-1 text-primary">
                  Review webhooks <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Users & Staff
            </CardTitle>
            <CardDescription className="text-xs">
              Manage platform roles, workspace members, and send staff team invitations.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button variant="outline" size="sm" asChild className="justify-between text-xs">
              <Link href="/admin/users">
                Platform Users <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="justify-between text-xs">
              <Link href="/admin/members">
                Workspace Members & Invites <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-primary" />
              Compliance & Audit
            </CardTitle>
            <CardDescription className="text-xs">
              Verify non-repudiation audit trails for all administrative mutations.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button variant="outline" size="sm" asChild className="justify-between text-xs">
              <Link href="/admin/audit">
                Audit Logs Explorer <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="justify-between text-xs">
              <Link href="/admin/workspaces">
                Tenancy Moderation <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Revenue & Reports
            </CardTitle>
            <CardDescription className="text-xs">
              Per-currency financial reconciliation and asynchronous report exports.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button variant="outline" size="sm" asChild className="justify-between text-xs">
              <Link href="/admin/analytics">
                Financial Ledger <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="justify-between text-xs">
              <Link href="/admin/analytics">
                Export Operations Center <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Audit Snippet */}
      {activeWorkspaceId && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                Recent Workspace Audit Events
              </CardTitle>
              <CardDescription className="text-xs">
                Real-time snapshot of administrative actions in the active workspace.
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link href="/admin/audit" className="flex items-center gap-1">
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {isLoadingAudit ? (
              <div className="text-xs text-muted-foreground py-4 text-center">Loading audit log...</div>
            ) : recentAudit?.data.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">
                No recent audit records in this workspace.
              </div>
            ) : (
              <div className="divide-y text-xs">
                {recentAudit?.data.slice(0, 5).map((log) => (
                  <div key={log.id} className="py-2.5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {log.action}
                      </Badge>
                      <span className="font-medium text-foreground truncate">{log.resourceType}</span>
                      {log.changes.reason && (
                        <span className="text-muted-foreground italic truncate">
                          &quot;{log.changes.reason}&quot;
                        </span>
                      )}
                    </div>
                    <span className="text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
