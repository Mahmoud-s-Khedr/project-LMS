'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, Save, CheckCircle2, RotateCcw, AlertTriangle, Ban } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { QuestionGradingCard } from './question-grading-card';
import { GradeEventHistory } from './grade-event-history';
import { StaleGradeAlert } from './stale-grade-alert';
import { RegradeDialog } from './regrade-dialog';
import { VoidDialog } from './void-dialog';
import {
  useStaffAttemptDetailQuery,
  useSubmitGradesMutation,
  useRegradeMutation,
  useVoidAttemptMutation,
} from '../hooks';
import { AttemptStatus, type AttemptQuestionGradeInput } from '../types';
import { resolveGradeEventQuestion } from '../utils';
import { Role } from '@lms/shared';

interface AttemptGradingViewProps {
  workspaceId: string;
  courseId: string;
  assessmentId: string;
  attemptId: string;
  userRoles?: readonly Role[];
}

export function AttemptGradingView({
  workspaceId,
  courseId,
  assessmentId,
  attemptId,
  userRoles = [Role.INSTRUCTOR],
}: AttemptGradingViewProps) {
  const {
    data: attempt,
    isLoading,
    error,
    refetch,
  } = useStaffAttemptDetailQuery(workspaceId, courseId, assessmentId, attemptId);

  const [questionGrades, setQuestionGrades] = React.useState<
    Record<string, AttemptQuestionGradeInput>
  >({});
  const [overallReason, setOverallReason] = React.useState('Initial instructor manual evaluation');
  const [staleConflict, setStaleConflict] = React.useState(false);
  const [regradeDialogOpen, setRegradeDialogOpen] = React.useState(false);
  const [voidDialogOpen, setVoidDialogOpen] = React.useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = React.useState<string | null>(null);

  // Initialize question grades state when attempt loads
  React.useEffect(() => {
    if (attempt) {
      const initial: Record<string, AttemptQuestionGradeInput> = {};
      attempt.questions.forEach((q) => {
        // Find existing grade event for this answer/question using answerId resolution
        const eventsForQuestion = attempt.gradeEvents.filter((ev) => {
          if (!ev.answerId) return false;
          if (
            ev.answerId === q.delivery.attemptQuestionId ||
            ev.answerId === q.answer?.attemptQuestionId
          ) {
            return true;
          }
          const resolved = resolveGradeEventQuestion(ev, attempt.questions);
          return resolved?.delivery.attemptQuestionId === q.delivery.attemptQuestionId;
        });

        const latestEvent = eventsForQuestion.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )[0];

        initial[q.delivery.attemptQuestionId] = {
          attemptQuestionId: q.delivery.attemptQuestionId,
          answerId:
            latestEvent?.answerId ?? q.answer?.attemptQuestionId ?? q.delivery.attemptQuestionId,
          awardedPoints: latestEvent ? latestEvent.awardedPoints : '0.000',
          rubricScores: latestEvent?.rubricScores ?? null,
          feedback: latestEvent?.feedback ?? null,
        };
      });
      setQuestionGrades(initial);
      setStaleConflict(false);
    }
  }, [attempt]);

  const submitGradesMutation = useSubmitGradesMutation(
    workspaceId,
    courseId,
    assessmentId,
    attemptId,
  );
  const regradeMutation = useRegradeMutation(workspaceId, courseId, assessmentId, attemptId);
  const voidMutation = useVoidAttemptMutation(workspaceId, courseId, assessmentId, attemptId);

  const isPending =
    submitGradesMutation.isPending || regradeMutation.isPending || voidMutation.isPending;

  // Live total points sum
  const liveTotalAwarded = React.useMemo(() => {
    return Object.values(questionGrades)
      .reduce((acc, q) => acc + (parseFloat(q.awardedPoints) || 0), 0)
      .toFixed(3);
  }, [questionGrades]);

  const handleGradeSubmit = async (final: boolean) => {
    if (!attempt) return;
    setSaveSuccessMsg(null);

    const answersPayload = Object.values(questionGrades).map((g) => ({
      answerId: g.answerId,
      awardedPoints: (parseFloat(g.awardedPoints) || 0).toFixed(3),
      rubricScores: g.rubricScores,
      feedback: g.feedback,
    }));

    try {
      await submitGradesMutation.mutateAsync({
        version: attempt.version,
        final,
        reason: overallReason.trim() || 'Manual evaluation completed',
        answers: answersPayload,
      });
      setSaveSuccessMsg(
        final ? 'Final grade published successfully.' : 'Draft grade saved successfully.',
      );
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('version') || msg.includes('stale') || msg.includes('conflict')) {
        setStaleConflict(true);
      } else {
        alert(`Grading failed: ${msg || 'Error occurred'}`);
      }
    }
  };

  const handleConfirmRegrade = async (reason: string) => {
    if (!attempt) return;
    const answersPayload = Object.values(questionGrades).map((g) => ({
      answerId: g.answerId,
      awardedPoints: (parseFloat(g.awardedPoints) || 0).toFixed(3),
      rubricScores: g.rubricScores,
      feedback: g.feedback,
    }));

    try {
      await regradeMutation.mutateAsync({
        version: attempt.version,
        final: true,
        reason,
        answers: answersPayload,
      });
      setSaveSuccessMsg('Regrade applied and new GradeEvent recorded.');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('version') || msg.includes('stale')) {
        setStaleConflict(true);
      } else {
        alert(`Regrade failed: ${msg}`);
      }
    }
  };

  const handleConfirmVoid = async (reason: string) => {
    if (!attempt) return;
    try {
      await voidMutation.mutateAsync({
        version: attempt.version,
        reason,
      });
      setSaveSuccessMsg('Attempt has been marked as VOID.');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    } catch (err: unknown) {
      alert(`Void failed: ${err instanceof Error ? err.message : 'Error'}`);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto p-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !attempt) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center border rounded-lg bg-destructive/5 text-destructive space-y-3">
        <AlertTriangle className="mx-auto h-8 w-8" />
        <h3 className="text-base font-semibold">Failed to load attempt</h3>
        <p className="text-xs text-muted-foreground">
          {error instanceof Error ? error.message : 'Attempt not found or access restricted.'}
        </p>
        <Link
          href={`/instructor/grading?workspaceId=${workspaceId}&courseId=${courseId}&assessmentId=${assessmentId}`}
        >
          <Button variant="outline" size="sm">
            Back to Grading Queue
          </Button>
        </Link>
      </div>
    );
  }

  const isGraded = attempt.status === AttemptStatus.GRADED;
  const isVoided = attempt.status === AttemptStatus.VOID;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Breadcrumb & Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <Link
          href={`/instructor/grading?workspaceId=${workspaceId}&courseId=${courseId}&assessmentId=${assessmentId}`}
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Grading Queue
        </Link>

        <div className="flex items-center gap-2">
          {!isVoided && (
            <>
              {isGraded ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRegradeDialogOpen(true)}
                  disabled={isPending}
                  className="gap-1.5"
                >
                  <RotateCcw className="h-4 w-4" />
                  Regrade Submission
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleGradeSubmit(false)}
                    disabled={isPending}
                    className="gap-1.5"
                  >
                    <Save className="h-4 w-4" />
                    Save Draft
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleGradeSubmit(true)}
                    disabled={isPending}
                    className="gap-1.5"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Submit Final Grade
                  </Button>
                </>
              )}

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVoidDialogOpen(true)}
                disabled={isPending}
                className="text-destructive hover:text-destructive gap-1"
              >
                <Ban className="h-4 w-4" />
                Void Attempt
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Stale conflict alert */}
      {staleConflict && <StaleGradeAlert onReload={() => refetch()} />}

      {/* Success alert */}
      {saveSuccessMsg && (
        <div className="rounded-lg border border-green-500/30 bg-green-50/50 dark:bg-green-950/20 p-3 text-xs text-green-800 dark:text-green-300">
          {saveSuccessMsg}
        </div>
      )}

      {/* Overview Card */}
      <Card className="border shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold tracking-tight">Attempt #{attempt.number}</h2>
                <Badge
                  variant={isGraded ? 'default' : isVoided ? 'destructive' : 'secondary'}
                  className={isGraded ? 'bg-green-600' : ''}
                >
                  {attempt.status}
                </Badge>
                <Badge variant="outline" className="font-mono text-xs">
                  v{attempt.version}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Enrollment ID: <span className="font-mono">{attempt.enrollmentId}</span> | Started:{' '}
                {new Date(attempt.startedAt).toLocaleString()}
              </p>
            </div>

            {/* Score pill */}
            <div className="flex items-center gap-4 bg-muted/30 p-3 rounded-lg border text-right">
              <div>
                <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                  Live Total
                </div>
                <div className="text-lg font-mono font-bold text-primary">
                  {liveTotalAwarded} / {attempt.totalPoints}
                </div>
              </div>
              {attempt.percent !== null && (
                <div className="border-l pl-4">
                  <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                    Current Score
                  </div>
                  <div className="text-lg font-mono font-bold">{attempt.percent}%</div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Overall Grade Reason input (for final grade) */}
      {!isGraded && !isVoided && (
        <div className="rounded-lg border p-4 bg-card space-y-1.5">
          <Label htmlFor="overall-reason" className="text-xs font-semibold">
            Overall Evaluation Justification / Reason (Audited)
          </Label>
          <Input
            id="overall-reason"
            value={overallReason}
            onChange={(e) => setOverallReason(e.target.value)}
            placeholder="e.g. Completed manual essay rubric evaluation and code verification"
            required
          />
        </div>
      )}

      {/* Questions Grading List */}
      <div className="space-y-4">
        <h3 className="text-base font-semibold">
          Submitted Questions ({attempt.questions.length})
        </h3>

        {attempt.questions.map((q, idx) => {
          const currentGrade = questionGrades[q.delivery.attemptQuestionId] ?? {
            attemptQuestionId: q.delivery.attemptQuestionId,
            answerId: q.answer?.attemptQuestionId ?? q.delivery.attemptQuestionId,
            awardedPoints: '0.000',
            rubricScores: null,
            feedback: null,
          };

          return (
            <QuestionGradingCard
              key={q.delivery.attemptQuestionId}
              workspaceId={workspaceId}
              attemptId={attempt.attemptId}
              questionItem={q}
              index={idx}
              gradeInput={currentGrade}
              rubric={attempt.rubric}
              onChangeGradeInput={(updated) => {
                setQuestionGrades((prev) => ({
                  ...prev,
                  [q.delivery.attemptQuestionId]: updated,
                }));
              }}
              disabled={isVoided}
            />
          );
        })}
      </div>

      {/* Audit Trail & History */}
      <div className="border-t pt-6">
        <GradeEventHistory events={attempt.gradeEvents} questions={attempt.questions} />
      </div>

      {/* Regrade Dialog */}
      <RegradeDialog
        open={regradeDialogOpen}
        onOpenChange={setRegradeDialogOpen}
        onConfirm={handleConfirmRegrade}
        isSubmitting={regradeMutation.isPending}
      />

      {/* Void Dialog */}
      <VoidDialog
        open={voidDialogOpen}
        onOpenChange={setVoidDialogOpen}
        userRoles={userRoles}
        onConfirm={handleConfirmVoid}
        isSubmitting={voidMutation.isPending}
      />
    </div>
  );
}
