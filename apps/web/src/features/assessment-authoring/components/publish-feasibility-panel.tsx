'use client';

import * as React from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { validateAssessmentPublishFeasibility } from '../utils';
import { usePublishAssessmentVersionMutation } from '../hooks';
import type { AssessmentVersionConfig, FixedQuestionItem, PoolConfigItem } from '../types';
import { ApiError } from '@/lib/api';

interface PublishFeasibilityPanelProps {
  workspaceId: string;
  courseId: string;
  assessmentId: string;
  versionId: string;
  versionNumber: number;
  isPublished: boolean;
  config: Partial<AssessmentVersionConfig>;
  fixedQuestions: FixedQuestionItem[];
  pools: PoolConfigItem[];
  onPublishSuccess: () => void;
}

export function PublishFeasibilityPanel({
  workspaceId,
  courseId,
  assessmentId,
  versionId,
  versionNumber,
  isPublished,
  config,
  fixedQuestions,
  pools,
  onPublishSuccess,
}: PublishFeasibilityPanelProps) {
  const publishMutation = usePublishAssessmentVersionMutation(workspaceId, courseId, assessmentId);

  // Run validation
  const validation = React.useMemo(() => {
    return validateAssessmentPublishFeasibility({
      config,
      fixedQuestions,
      pools,
    });
  }, [config, fixedQuestions, pools]);

  const totalFixedPoints = fixedQuestions.reduce((acc, q) => acc + (parseFloat(q.points) || 0), 0);
  const totalPoolPoints = pools.reduce(
    (acc, p) => acc + p.count * (parseFloat(p.pointsEach) || 0),
    0,
  );
  const grandTotal = (totalFixedPoints + totalPoolPoints).toFixed(3);
  const totalQuestionsDelivered =
    fixedQuestions.length + pools.reduce((acc, p) => acc + p.count, 0);

  const handlePublish = async () => {
    if (
      !window.confirm(
        `Publish version v${versionNumber}? Once published, this version is locked and cannot be edited in place. A new draft must be created for future changes.`,
      )
    ) {
      return;
    }

    try {
      await publishMutation.mutateAsync({
        versionId,
        version: versionNumber,
      });
      onPublishSuccess();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        alert(
          'Stale edit: The assessment was updated elsewhere. Please reload and review before publishing.',
        );
      } else {
        const msg = err instanceof Error ? err.message : 'Publish failed';
        alert(`Publish error: ${msg}`);
      }
    }
  };

  return (
    <div className="space-y-6">
      <Card className="border shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Publish Feasibility & Release Audit</CardTitle>
              <CardDescription>
                Verifies assessment delivery invariants before releasing version v{versionNumber} to
                enrolled students.
              </CardDescription>
            </div>
            {isPublished ? (
              <Badge variant="default" className="gap-1 bg-green-600 hover:bg-green-700">
                <Lock className="h-3 w-3" /> Published & Frozen
              </Badge>
            ) : (
              <Badge variant="secondary">Draft Mode</Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Metrics summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 rounded-lg bg-muted/30 p-4 border text-center">
            <div>
              <div className="text-xs text-muted-foreground">Fixed Questions</div>
              <div className="text-xl font-bold font-mono">{fixedQuestions.length}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Random Pools</div>
              <div className="text-xl font-bold font-mono">{pools.length}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Delivered Questions</div>
              <div className="text-xl font-bold font-mono">{totalQuestionsDelivered}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total Points</div>
              <div className="text-xl font-bold font-mono text-primary">{grandTotal}</div>
            </div>
          </div>

          {/* Published lock notice */}
          {isPublished && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-50/50 p-4 dark:bg-blue-950/20 text-sm">
              <div className="flex items-center gap-2 font-semibold text-blue-700 dark:text-blue-300">
                <Lock className="h-4 w-4" /> This version is published and immutable
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Student submissions and attempts reference this exact version configuration. If you
                need to change instructions, pools, or questions, create a new draft version.
              </p>
            </div>
          )}

          {/* Validation Checklist */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">Readiness Verification</h4>

            {validation.errors.length > 0 && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                  <AlertCircle className="h-4 w-4" /> The following issues must be resolved before
                  publishing:
                </div>
                <ul className="list-disc list-inside text-xs text-destructive space-y-1">
                  {validation.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {validation.warnings.length > 0 && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 p-4 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4" /> Warnings:
                </div>
                <ul className="list-disc list-inside text-xs text-amber-700 dark:text-amber-400 space-y-1">
                  {validation.warnings.map((warn, i) => (
                    <li key={i}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}

            {validation.isValid && (
              <div className="rounded-lg border border-green-500/30 bg-green-50/50 dark:bg-green-950/20 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-green-700 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" /> All delivery invariants satisfied
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Question count, scheduling windows, rubric points, and pool requirements are all
                  valid for release.
                </p>
              </div>
            )}
          </div>

          {/* Action trigger */}
          {!isPublished && (
            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                onClick={handlePublish}
                disabled={!validation.isValid || publishMutation.isPending}
                className="gap-2"
              >
                <Lock className="h-4 w-4" />
                {publishMutation.isPending
                  ? 'Publishing Version...'
                  : `Publish Version v${versionNumber}`}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
