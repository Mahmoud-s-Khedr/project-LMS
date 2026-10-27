'use client';

import * as React from 'react';
import {
  Settings,
  ListOrdered,
  Shuffle,
  Award,
  Users,
  CheckCircle2,
  Lock,
  Plus,
  Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FixedQuestionsManager } from './fixed-questions-manager';
import { PoolsManager } from './pools-manager';
import { RubricBuilder } from './rubric-builder';
import { AccommodationsManager } from './accommodations-manager';
import { PublishFeasibilityPanel } from './publish-feasibility-panel';
import { textToRichText, richTextToText, formatPercent, formatPoints } from '../utils';
import {
  useUpdateAssessmentVersionMutation,
  useCreateAssessmentVersionMutation,
  useReplaceAssessmentQuestionsMutation,
  useReplaceAssessmentPoolsMutation,
  useAssessmentVersionsQuery,
  useSelectedQuestionsQuery,
  useSelectedPoolsQuery,
} from '../hooks';
import { ApiError } from '@/lib/api';
import {
  AssessmentStatus,
  GradePolicy,
  FeedbackPolicy,
  type QuestionType,
  type Assessment,
  type AssessmentVersionConfig,
  type AssessmentVersion,
  type FixedQuestionItem,
  type PoolConfigItem,
  type RubricCriterionItem,
} from '../types';

interface AssessmentVersionEditorProps {
  workspaceId: string;
  courseId: string;
  assessment: Assessment;
  initialVersionConfig?: Partial<AssessmentVersionConfig>;
  initialVersionId?: string;
  initialVersionNumber?: number;
  initialStatus?: string;
}

export function AssessmentVersionEditor({
  workspaceId,
  courseId,
  assessment,
  initialVersionConfig,
  initialVersionId = 'draft-v1',
  initialVersionNumber = 1,
  initialStatus = AssessmentStatus.DRAFT,
}: AssessmentVersionEditorProps) {
  const [activeTab, setActiveTab] = React.useState('settings');
  const [status, setStatus] = React.useState<string>(initialStatus);
  const [versionNumber, setVersionNumber] = React.useState<number>(initialVersionNumber);
  const [versionId, setVersionId] = React.useState<string>(initialVersionId);

  // Settings State
  const [instructionsText, setInstructionsText] = React.useState(
    richTextToText(initialVersionConfig?.instructions) ||
      'Please read all instructions before starting.',
  );
  const [hasTimeLimit, setHasTimeLimit] = React.useState(
    Boolean(initialVersionConfig?.timeLimitSeconds),
  );
  const [timeLimitMinutes, setTimeLimitMinutes] = React.useState(
    initialVersionConfig?.timeLimitSeconds
      ? String(Math.round(initialVersionConfig.timeLimitSeconds / 60))
      : '60',
  );
  const [maxAttempts, setMaxAttempts] = React.useState(
    String(initialVersionConfig?.maxAttempts ?? 3),
  );
  const [passPercent, setPassPercent] = React.useState(
    initialVersionConfig?.passPercent ?? '70.00',
  );
  const [availableFrom, setAvailableFrom] = React.useState(
    initialVersionConfig?.availableFrom
      ? new Date(initialVersionConfig.availableFrom).toISOString().slice(0, 16)
      : '',
  );
  const [dueAt, setDueAt] = React.useState(
    initialVersionConfig?.dueAt
      ? new Date(initialVersionConfig.dueAt).toISOString().slice(0, 16)
      : '',
  );
  const [availableUntil, setAvailableUntil] = React.useState(
    initialVersionConfig?.availableUntil
      ? new Date(initialVersionConfig.availableUntil).toISOString().slice(0, 16)
      : '',
  );
  const [allowLateSubmission, setAllowLateSubmission] = React.useState(
    initialVersionConfig?.allowLateSubmission ?? false,
  );
  const [latePenaltyPercent] = React.useState(initialVersionConfig?.latePenaltyPercent ?? '10.00');
  const [gradePolicy, setGradePolicy] = React.useState<string>(
    initialVersionConfig?.gradePolicy ?? GradePolicy.HIGHEST,
  );
  const [feedbackPolicy, setFeedbackPolicy] = React.useState<string>(
    initialVersionConfig?.feedbackPolicy ?? FeedbackPolicy.IMMEDIATE,
  );
  const [shuffleQuestions, setShuffleQuestions] = React.useState(
    initialVersionConfig?.shuffleQuestions ?? true,
  );
  const [shuffleOptions, setShuffleOptions] = React.useState(
    initialVersionConfig?.shuffleOptions ?? true,
  );

  // File Upload Constraints
  const [maxFiles] = React.useState(String(initialVersionConfig?.maxFiles ?? 1));
  const [maxUploadBytes] = React.useState(
    initialVersionConfig?.maxUploadBytes ?? '10485760', // 10 MiB
  );

  // Rubric State
  const [rubricEnabled, setRubricEnabled] = React.useState(
    Boolean(initialVersionConfig?.rubric && initialVersionConfig.rubric.criteria.length > 0),
  );
  const [rubricCriteria, setRubricCriteria] = React.useState<RubricCriterionItem[]>(() => {
    if (initialVersionConfig?.rubric?.criteria) {
      return initialVersionConfig.rubric.criteria.map((c) => ({
        id: c.id,
        label: c.label,
        description: c.description ?? '',
        maxPoints: c.maxPoints,
      }));
    }
    return [
      {
        id: 'crit-1',
        label: 'Correctness & Depth',
        description: 'Demonstrates thorough understanding of the domain concepts.',
        maxPoints: '10.000',
      },
    ];
  });

  // Fixed Questions State
  const [fixedQuestions, setFixedQuestions] = React.useState<FixedQuestionItem[]>([]);

  // Pools State
  const [pools, setPools] = React.useState<PoolConfigItem[]>([]);

  const [saveSuccessMessage, setSaveSuccessMessage] = React.useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = React.useState<string | null>(null);

  // Helper to test valid UUID format
  const isValidUuid = React.useCallback(
    (val?: string): boolean =>
      typeof val === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val),
    [],
  );

  // Apply configuration from a loaded version
  const applyVersionConfig = React.useCallback(
    (cfg: AssessmentVersion | Partial<AssessmentVersionConfig>) => {
      if (cfg.instructions) setInstructionsText(richTextToText(cfg.instructions));
      setHasTimeLimit(Boolean(cfg.timeLimitSeconds));
      if (cfg.timeLimitSeconds) {
        setTimeLimitMinutes(String(Math.round(cfg.timeLimitSeconds / 60)));
      }
      if (cfg.maxAttempts !== undefined) setMaxAttempts(String(cfg.maxAttempts));
      if (cfg.passPercent !== undefined) setPassPercent(cfg.passPercent);
      if (cfg.availableFrom)
        setAvailableFrom(new Date(cfg.availableFrom).toISOString().slice(0, 16));
      if (cfg.dueAt) setDueAt(new Date(cfg.dueAt).toISOString().slice(0, 16));
      if (cfg.availableUntil)
        setAvailableUntil(new Date(cfg.availableUntil).toISOString().slice(0, 16));
      if (cfg.allowLateSubmission !== undefined) setAllowLateSubmission(cfg.allowLateSubmission);
      if (cfg.gradePolicy) setGradePolicy(cfg.gradePolicy);
      if (cfg.feedbackPolicy) setFeedbackPolicy(cfg.feedbackPolicy);
      if (cfg.shuffleQuestions !== undefined) setShuffleQuestions(cfg.shuffleQuestions);
      if (cfg.shuffleOptions !== undefined) setShuffleOptions(cfg.shuffleOptions);
      if (cfg.rubric) {
        setRubricEnabled(Boolean(cfg.rubric.criteria?.length));
        if (cfg.rubric.criteria) {
          setRubricCriteria(
            cfg.rubric.criteria.map((c) => ({
              id: c.id,
              label: c.label,
              description: c.description ?? '',
              maxPoints: c.maxPoints,
            })),
          );
        }
      }
    },
    [],
  );

  // Versions query to discover existing draft or published versions
  const { data: versionsData, refetch: refetchVersions } = useAssessmentVersionsQuery(
    workspaceId,
    courseId,
    assessment.id,
    {},
    { enabled: Boolean(workspaceId && courseId && assessment.id) },
  );

  const versions = React.useMemo(() => versionsData?.data ?? [], [versionsData]);

  const handleSelectVersion = React.useCallback(
    (selectedId: string) => {
      const target = versions.find((v) => v.id === selectedId);
      if (!target) return;
      setVersionId(target.id);
      setVersionNumber(target.version);
      setStatus(target.status);
      applyVersionConfig(target);
    },
    [versions, applyVersionConfig],
  );

  // Auto-discover existing draft (or published version)
  const discoveredRef = React.useRef(false);
  React.useEffect(() => {
    if (!discoveredRef.current && versions.length > 0) {
      discoveredRef.current = true;
      const draft = versions.find((v) => v.status === 'DRAFT');
      const target = draft ?? versions[0];
      if (target) {
        setVersionId(target.id);
        setVersionNumber(target.version);
        setStatus(target.status);
        applyVersionConfig(target);
      }
    }
  }, [versions, applyVersionConfig]);

  // Draft questions & pools hydration via GET endpoints
  const isRealUuid = isValidUuid(versionId);

  const { data: questionsData } = useSelectedQuestionsQuery(
    workspaceId,
    courseId,
    assessment.id,
    versionId,
    { enabled: Boolean(workspaceId && courseId && assessment.id && isRealUuid) },
  );

  React.useEffect(() => {
    if (questionsData?.questions) {
      setFixedQuestions(
        questionsData.questions.map((q) => ({
          questionVersionId: q.questionVersionId,
          points: q.points,
          position: q.position,
          isRequired: q.isRequired,
        })),
      );
    }
  }, [questionsData]);

  const { data: poolsData } = useSelectedPoolsQuery(
    workspaceId,
    courseId,
    assessment.id,
    versionId,
    { enabled: Boolean(workspaceId && courseId && assessment.id && isRealUuid) },
  );

  React.useEffect(() => {
    if (poolsData?.pools) {
      setPools(
        poolsData.pools.map((p) => ({
          bankId: p.bankId,
          position: p.position,
          count: p.count,
          pointsEach: p.pointsEach,
          tags: p.tags,
          questionType: p.questionType,
        })),
      );
    }
  }, [poolsData]);

  // Mutations
  const updateVersionMutation = useUpdateAssessmentVersionMutation(
    workspaceId,
    courseId,
    assessment.id,
  );
  const createDraftMutation = useCreateAssessmentVersionMutation(
    workspaceId,
    courseId,
    assessment.id,
  );
  const replaceQuestionsMutation = useReplaceAssessmentQuestionsMutation(
    workspaceId,
    courseId,
    assessment.id,
  );
  const replacePoolsMutation = useReplaceAssessmentPoolsMutation(
    workspaceId,
    courseId,
    assessment.id,
  );

  const isPublished = status === AssessmentStatus.PUBLISHED;

  // Build current version config snapshot
  const currentConfig: Partial<AssessmentVersionConfig> = React.useMemo(() => {
    return {
      instructions: textToRichText(instructionsText),
      maxAttempts: parseInt(maxAttempts, 10) || 1,
      timeLimitSeconds: hasTimeLimit ? (parseInt(timeLimitMinutes, 10) || 60) * 60 : null,
      availableFrom: availableFrom ? new Date(availableFrom).toISOString() : null,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      availableUntil: availableUntil ? new Date(availableUntil).toISOString() : null,
      allowLateSubmission,
      latePenaltyPercent: formatPercent(latePenaltyPercent),
      passPercent: formatPercent(passPercent),
      gradePolicy: gradePolicy as unknown as undefined,
      feedbackPolicy: feedbackPolicy as unknown as undefined,
      shuffleQuestions,
      shuffleOptions,
      rubric: rubricEnabled
        ? {
            criteria: rubricCriteria.map((c) => ({
              id: c.id,
              label: c.label,
              description: c.description || undefined,
              maxPoints: formatPoints(c.maxPoints),
            })),
          }
        : null,
      allowedFileTypes: ['application/pdf' as const],
      maxUploadBytes,
      maxFiles: parseInt(maxFiles, 10) || 1,
    };
  }, [
    instructionsText,
    maxAttempts,
    hasTimeLimit,
    timeLimitMinutes,
    availableFrom,
    dueAt,
    availableUntil,
    allowLateSubmission,
    latePenaltyPercent,
    passPercent,
    gradePolicy,
    feedbackPolicy,
    shuffleQuestions,
    shuffleOptions,
    rubricEnabled,
    rubricCriteria,
    maxUploadBytes,
    maxFiles,
  ]);

  // Create or switch to existing draft version
  const handleCreateNewDraft = async () => {
    try {
      setSaveErrorMessage(null);
      // Discover if a draft already exists in the version list to prevent 409
      const existingDraft = versions.find((v) => v.status === 'DRAFT');
      if (existingDraft) {
        handleSelectVersion(existingDraft.id);
        setSaveSuccessMessage(
          `Switched to existing editable draft version v${existingDraft.version}.`,
        );
        setTimeout(() => setSaveSuccessMessage(null), 4000);
        return;
      }

      const newDraft = await createDraftMutation.mutateAsync();
      setVersionId(newDraft.id);
      setVersionNumber(newDraft.version);
      setStatus(newDraft.status);
      applyVersionConfig(newDraft);
      setSaveSuccessMessage(
        `Created new draft version v${newDraft.version}! You can now edit questions and settings.`,
      );
      void refetchVersions();
      setTimeout(() => setSaveSuccessMessage(null), 4000);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setSaveErrorMessage('An editable draft already exists. Discovering draft...');
        void refetchVersions();
      } else {
        setSaveErrorMessage(err instanceof Error ? err.message : 'Failed to create draft version');
      }
    }
  };

  // Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isPublished) return;

    try {
      setSaveErrorMessage(null);
      await updateVersionMutation.mutateAsync({
        versionId,
        input: {
          ...currentConfig,
          version: versionNumber,
        },
      });
      setSaveSuccessMessage('Assessment settings saved successfully.');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setSaveErrorMessage(
          'Stale edit: Assessment version was modified by another session. Please reload to sync.',
        );
        void refetchVersions();
      } else {
        setSaveErrorMessage(err instanceof Error ? err.message : 'Failed to save settings');
      }
    }
  };

  // Save Fixed Questions
  const handleSaveQuestions = async () => {
    if (isPublished) return;
    try {
      setSaveErrorMessage(null);
      await replaceQuestionsMutation.mutateAsync({
        versionId,
        input: {
          version: versionNumber,
          questions: fixedQuestions.map((q) => ({
            questionVersionId: q.questionVersionId,
            points: formatPoints(q.points),
            position: q.position,
            isRequired: q.isRequired,
          })),
        },
      });
      setSaveSuccessMessage('Fixed questions saved.');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setSaveErrorMessage(
          'Stale edit: Assessment was modified elsewhere. Please reload to sync.',
        );
        void refetchVersions();
      } else {
        setSaveErrorMessage(err instanceof Error ? err.message : 'Failed to save questions');
      }
    }
  };

  // Save Pools
  const handleSavePools = async () => {
    if (isPublished) return;
    try {
      setSaveErrorMessage(null);
      await replacePoolsMutation.mutateAsync({
        versionId,
        input: {
          version: versionNumber,
          pools: pools.map((p) => ({
            bankId: p.bankId,
            position: p.position,
            count: p.count,
            pointsEach: formatPoints(p.pointsEach),
            tags: p.tags,
            questionType: p.questionType ? (p.questionType as QuestionType) : null,
          })),
        },
      });
      setSaveSuccessMessage('Question pools saved.');
      setTimeout(() => setSaveSuccessMessage(null), 3000);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setSaveErrorMessage(
          'Stale edit: Assessment was modified elsewhere. Please reload to sync.',
        );
        void refetchVersions();
      } else {
        setSaveErrorMessage(err instanceof Error ? err.message : 'Failed to save pools');
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <Card className="border shadow-sm">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight">{assessment.title}</h1>
                <Badge variant="outline">{assessment.kind}</Badge>
                {isPublished ? (
                  <Badge
                    variant="default"
                    className="bg-green-600 hover:bg-green-700 gap-1 text-xs"
                  >
                    <Lock className="h-3 w-3" /> v{versionNumber} (Published)
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    v{versionNumber} (Draft)
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Course: {courseId.slice(0, 8)}... | Assessment ID: {assessment.id.slice(0, 8)}...
              </p>
            </div>

            {/* Action buttons and Version Selector */}
            <div className="flex items-center gap-3">
              {versions.length > 1 && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground font-medium">Version:</span>
                  <Select value={versionId} onValueChange={handleSelectVersion}>
                    <SelectTrigger className="h-8 w-36 text-xs">
                      <SelectValue placeholder={`v${versionNumber}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {versions.map((v) => (
                        <SelectItem key={v.id} value={v.id} className="text-xs">
                          v{v.version} ({v.status})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {isPublished && (
                <Button
                  onClick={handleCreateNewDraft}
                  disabled={createDraftMutation.isPending}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {createDraftMutation.isPending
                    ? 'Cloning Draft...'
                    : versions.some((v) => v.status === 'DRAFT')
                      ? 'Edit Existing Draft'
                      : 'Create New Draft Version'}
                </Button>
              )}
            </div>
          </div>

          {/* Published read-only warning */}
          {isPublished && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
                <Lock className="h-4 w-4 shrink-0" />
                <span>
                  Version v{versionNumber} is published and frozen. Existing attempts depend on
                  these exact rules. Click &quot;Create New Draft Version&quot; to make changes.
                </span>
              </div>
            </div>
          )}

          {/* Feedback alerts */}
          {saveSuccessMessage && (
            <div className="mt-4 rounded-lg border border-green-500/30 bg-green-50/50 dark:bg-green-950/20 p-3 text-xs text-green-800 dark:text-green-300">
              {saveSuccessMessage}
            </div>
          )}
          {saveErrorMessage && (
            <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {saveErrorMessage}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabs navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-3 sm:grid-cols-6 h-auto p-1 gap-1">
          <TabsTrigger value="settings" className="gap-1.5 py-2 text-xs">
            <Settings className="h-3.5 w-3.5" /> Settings
          </TabsTrigger>
          <TabsTrigger value="questions" className="gap-1.5 py-2 text-xs">
            <ListOrdered className="h-3.5 w-3.5" /> Fixed ({fixedQuestions.length})
          </TabsTrigger>
          <TabsTrigger value="pools" className="gap-1.5 py-2 text-xs">
            <Shuffle className="h-3.5 w-3.5" /> Pools ({pools.length})
          </TabsTrigger>
          <TabsTrigger value="rubric" className="gap-1.5 py-2 text-xs">
            <Award className="h-3.5 w-3.5" /> Rubric
          </TabsTrigger>
          <TabsTrigger value="accommodations" className="gap-1.5 py-2 text-xs">
            <Users className="h-3.5 w-3.5" /> Accommodations
          </TabsTrigger>
          <TabsTrigger value="publish" className="gap-1.5 py-2 text-xs font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5" /> Publish Audit
          </TabsTrigger>
        </TabsList>

        {/* 1. SETTINGS TAB */}
        <TabsContent value="settings">
          <Card className="border shadow-sm">
            <CardHeader>
              <CardTitle className="text-base">Timing, Attempts & Feedback Policies</CardTitle>
              <CardDescription>
                Configure availability schedules, time limits, grade aggregation, and answer release
                rules.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSaveSettings}>
              <CardContent className="space-y-6">
                {/* Instructions */}
                <div className="space-y-1.5">
                  <Label htmlFor="inst-text">Assessment Instructions</Label>
                  <Textarea
                    id="inst-text"
                    rows={3}
                    value={instructionsText}
                    onChange={(e) => setInstructionsText(e.target.value)}
                    disabled={isPublished}
                    required
                  />
                </div>

                {/* Timing & Scheduling */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="avail-from">Available From (Start)</Label>
                    <Input
                      id="avail-from"
                      type="datetime-local"
                      value={availableFrom}
                      onChange={(e) => setAvailableFrom(e.target.value)}
                      disabled={isPublished}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="due-at">Due Date</Label>
                    <Input
                      id="due-at"
                      type="datetime-local"
                      value={dueAt}
                      onChange={(e) => setDueAt(e.target.value)}
                      disabled={isPublished}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="avail-until">Available Until (Hard Cutoff)</Label>
                    <Input
                      id="avail-until"
                      type="datetime-local"
                      value={availableUntil}
                      onChange={(e) => setAvailableUntil(e.target.value)}
                      disabled={isPublished}
                    />
                  </div>
                </div>

                {/* Time Limit & Attempts */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t pt-4">
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                      <input
                        type="checkbox"
                        checked={hasTimeLimit}
                        onChange={(e) => setHasTimeLimit(e.target.checked)}
                        disabled={isPublished}
                        className="h-4 w-4 rounded"
                      />
                      Enforce Time Limit
                    </label>
                    {hasTimeLimit && (
                      <div className="space-y-1">
                        <Label htmlFor="time-limit" className="text-xs">
                          Duration (Minutes)
                        </Label>
                        <Input
                          id="time-limit"
                          type="number"
                          min="1"
                          max="10080"
                          value={timeLimitMinutes}
                          onChange={(e) => setTimeLimitMinutes(e.target.value)}
                          disabled={isPublished}
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="max-attempts">Max Attempts</Label>
                    <Input
                      id="max-attempts"
                      type="number"
                      min="1"
                      max="100"
                      value={maxAttempts}
                      onChange={(e) => setMaxAttempts(e.target.value)}
                      disabled={isPublished}
                      required
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="pass-pct">Pass Threshold (%)</Label>
                    <Input
                      id="pass-pct"
                      type="number"
                      step="1"
                      min="0"
                      max="100"
                      value={passPercent}
                      onChange={(e) => setPassPercent(e.target.value)}
                      disabled={isPublished}
                      required
                    />
                  </div>
                </div>

                {/* Policies */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
                  <div className="space-y-1.5">
                    <Label>Grade Policy (Final Grade Calculation)</Label>
                    <Select
                      value={gradePolicy}
                      onValueChange={setGradePolicy}
                      disabled={isPublished}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={GradePolicy.HIGHEST}>Highest Attempt Score</SelectItem>
                        <SelectItem value={GradePolicy.LATEST}>Latest Attempt Score</SelectItem>
                        <SelectItem value={GradePolicy.FIRST}>First Attempt Score</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Feedback & Key Release Policy</Label>
                    <Select
                      value={feedbackPolicy}
                      onValueChange={setFeedbackPolicy}
                      disabled={isPublished}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={FeedbackPolicy.IMMEDIATE}>
                          Immediate (After submission)
                        </SelectItem>
                        <SelectItem value={FeedbackPolicy.AFTER_DUE}>
                          After Due Date Window
                        </SelectItem>
                        <SelectItem value={FeedbackPolicy.AFTER_GRADING}>
                          After Manual Grading Completes
                        </SelectItem>
                        <SelectItem value={FeedbackPolicy.NEVER}>Never (Secure Exam)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Randomization */}
                <div className="flex flex-wrap gap-6 border-t pt-4 text-sm">
                  <label className="flex items-center gap-2 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shuffleQuestions}
                      onChange={(e) => setShuffleQuestions(e.target.checked)}
                      disabled={isPublished}
                      className="h-4 w-4 rounded"
                    />
                    Shuffle question delivery order
                  </label>
                  <label className="flex items-center gap-2 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={shuffleOptions}
                      onChange={(e) => setShuffleOptions(e.target.checked)}
                      disabled={isPublished}
                      className="h-4 w-4 rounded"
                    />
                    Shuffle choice options order
                  </label>
                  <label className="flex items-center gap-2 font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowLateSubmission}
                      onChange={(e) => setAllowLateSubmission(e.target.checked)}
                      disabled={isPublished}
                      className="h-4 w-4 rounded"
                    />
                    Allow late submission (Penalized)
                  </label>
                </div>

                {!isPublished && (
                  <div className="flex justify-end pt-4 border-t">
                    <Button
                      type="submit"
                      disabled={updateVersionMutation.isPending}
                      className="gap-2"
                    >
                      <Save className="h-4 w-4" />
                      {updateVersionMutation.isPending ? 'Saving...' : 'Save Settings'}
                    </Button>
                  </div>
                )}
              </CardContent>
            </form>
          </Card>
        </TabsContent>

        {/* 2. FIXED QUESTIONS TAB */}
        <TabsContent value="questions">
          <Card className="border shadow-sm p-6">
            <FixedQuestionsManager
              workspaceId={workspaceId}
              isPublished={isPublished}
              questions={fixedQuestions}
              onChange={setFixedQuestions}
              onSave={handleSaveQuestions}
              isSaving={replaceQuestionsMutation.isPending}
            />
          </Card>
        </TabsContent>

        {/* 3. POOLS TAB */}
        <TabsContent value="pools">
          <Card className="border shadow-sm p-6">
            <PoolsManager
              workspaceId={workspaceId}
              isPublished={isPublished}
              pools={pools}
              onChange={setPools}
              onSave={handleSavePools}
              isSaving={replacePoolsMutation.isPending}
            />
          </Card>
        </TabsContent>

        {/* 4. RUBRIC TAB */}
        <TabsContent value="rubric">
          <Card className="border shadow-sm p-6">
            <RubricBuilder
              isPublished={isPublished}
              rubricEnabled={rubricEnabled}
              onToggleEnabled={setRubricEnabled}
              criteria={rubricCriteria}
              onChangeCriteria={setRubricCriteria}
            />
            {!isPublished && rubricEnabled && (
              <div className="flex justify-end pt-4 border-t mt-4">
                <Button
                  type="button"
                  onClick={handleSaveSettings}
                  disabled={updateVersionMutation.isPending}
                  className="gap-2"
                >
                  <Save className="h-4 w-4" />
                  Save Rubric
                </Button>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* 5. ACCOMMODATIONS TAB */}
        <TabsContent value="accommodations">
          <Card className="border shadow-sm p-6">
            <AccommodationsManager
              workspaceId={workspaceId}
              courseId={courseId}
              assessmentId={assessment.id}
            />
          </Card>
        </TabsContent>

        {/* 6. PUBLISH AUDIT TAB */}
        <TabsContent value="publish">
          <PublishFeasibilityPanel
            workspaceId={workspaceId}
            courseId={courseId}
            assessmentId={assessment.id}
            versionId={versionId}
            versionNumber={versionNumber}
            isPublished={isPublished}
            config={currentConfig}
            fixedQuestions={fixedQuestions}
            pools={pools}
            onPublishSuccess={() => {
              setStatus(AssessmentStatus.PUBLISHED);
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
