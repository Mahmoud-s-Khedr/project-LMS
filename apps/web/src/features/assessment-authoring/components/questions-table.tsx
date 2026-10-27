'use client';

import * as React from 'react';
import { Search, Plus, History, Archive, Edit, MoreVertical, FileQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { QuestionVersionHistoryDialog } from './question-version-history-dialog';
import { richTextToText } from '../utils';
import { useQuestionsInBankQuery, useArchiveQuestionMutation } from '../hooks';
import { QuestionType, type AuthorQuestion } from '../types';
import { ApiError } from '@/lib/api';

interface QuestionsTableProps {
  workspaceId: string;
  bankId: string;
  onEditQuestion: (question: AuthorQuestion) => void;
  onAddQuestion: () => void;
}

export function QuestionsTable({
  workspaceId,
  bankId,
  onEditQuestion,
  onAddQuestion,
}: QuestionsTableProps) {
  const [search, setSearch] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState<string>('ALL');
  const [statusFilter, setStatusFilter] = React.useState<'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [conflictError, setConflictError] = React.useState<string | null>(null);

  // History dialog state
  const [historyTarget, setHistoryTarget] = React.useState<AuthorQuestion | null>(null);

  const { data, isLoading, error, refetch } = useQuestionsInBankQuery(workspaceId, bankId, {
    search: search || undefined,
    type: typeFilter !== 'ALL' ? (typeFilter as unknown as undefined) : undefined,
    status: statusFilter,
  });

  const archiveMutation = useArchiveQuestionMutation(workspaceId, bankId);

  const questions = data?.data ?? [];

  const handleArchive = async (question: AuthorQuestion) => {
    if (
      window.confirm(
        `Archive question "${question.title}"? References in existing assessments will remain.`,
      )
    ) {
      try {
        setConflictError(null);
        await archiveMutation.mutateAsync({
          questionId: question.id,
          ifMatch: question,
        });
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 409) {
          setConflictError(
            'This question was modified by another session. Please reload to see the latest version.',
          );
          void refetch();
        } else {
          alert(err instanceof Error ? err.message : 'Archive failed');
        }
      }
    }
  };

  return (
    <div className="space-y-4">
      {conflictError && (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between"
        >
          <span>{conflictError}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refetch()}
            className="h-7 text-xs"
          >
            Reload Now
          </Button>
        </div>
      )}

      {/* Controls Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search questions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>

          {/* Type Filter */}
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44 h-9">
              <SelectValue placeholder="All Question Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Question Types</SelectItem>
              <SelectItem value={QuestionType.SINGLE_CHOICE}>Single Choice</SelectItem>
              <SelectItem value={QuestionType.MULTIPLE_CHOICE}>Multiple Choice</SelectItem>
              <SelectItem value={QuestionType.TRUE_FALSE}>True / False</SelectItem>
              <SelectItem value={QuestionType.SHORT_ANSWER}>Short Answer</SelectItem>
              <SelectItem value={QuestionType.NUMERIC}>Numeric</SelectItem>
              <SelectItem value={QuestionType.ESSAY}>Essay</SelectItem>
              <SelectItem value={QuestionType.FILE_UPLOAD}>File Upload</SelectItem>
              <SelectItem value={QuestionType.MATCHING}>Matching</SelectItem>
              <SelectItem value={QuestionType.ORDERING}>Ordering</SelectItem>
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as 'ACTIVE' | 'ARCHIVED')}
          >
            <SelectTrigger className="w-32 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="ARCHIVED">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button onClick={onAddQuestion} className="gap-2 h-9">
          <Plus className="h-4 w-4" />
          Add Question
        </Button>
      </div>

      {/* Table view */}
      {isLoading ? (
        <div className="space-y-2 border rounded-md p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : error ? (
        <div className="p-8 text-center border rounded-md bg-destructive/5 text-destructive">
          Failed to load questions: {error instanceof Error ? error.message : 'Error'}
        </div>
      ) : questions.length === 0 ? (
        <div className="p-12 text-center border border-dashed rounded-md">
          <FileQuestion className="mx-auto h-12 w-12 text-muted-foreground/60 mb-2" />
          <h4 className="font-semibold text-base">No Questions Found</h4>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto mb-4">
            {search || typeFilter !== 'ALL'
              ? 'No questions match your current search and type filters.'
              : 'This bank has no questions yet. Create your first question to build quizzes and pool draws.'}
          </p>
          <Button onClick={onAddQuestion} variant="outline" size="sm">
            Add Question
          </Button>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[35%]">Title / Prompt</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead className="text-right">Points</TableHead>
                <TableHead className="text-center">Version</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.map((q) => {
                const promptSummary = richTextToText(q.latestVersion.payload.prompt);
                return (
                  <TableRow key={q.id}>
                    <TableCell>
                      <div className="font-medium line-clamp-1">{q.title}</div>
                      <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {promptSummary || 'No prompt text'}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal text-xs">
                        {q.latestVersion.payload.type}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1 max-w-[200px]">
                        {q.tags.length === 0 ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                          q.tags.slice(0, 3).map((t) => (
                            <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">
                              {t}
                            </Badge>
                          ))
                        )}
                        {q.tags.length > 3 && (
                          <Badge variant="ghost" className="text-[10px] px-1 py-0">
                            +{q.tags.length - 3}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {q.latestVersion.payload.defaultPoints}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary" className="font-mono text-xs">
                        v{q.latestVersion.version}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreVertical className="h-4 w-4" />
                            <span className="sr-only">Actions</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEditQuestion(q)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit / New Version
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setHistoryTarget(q)}>
                            <History className="mr-2 h-4 w-4" />
                            Version History
                          </DropdownMenuItem>
                          {!q.archivedAt && (
                            <DropdownMenuItem
                              onClick={() => handleArchive(q)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Archive className="mr-2 h-4 w-4" />
                              Archive Question
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Version History Dialog */}
      {historyTarget && (
        <QuestionVersionHistoryDialog
          workspaceId={workspaceId}
          questionId={historyTarget.id}
          questionTitle={historyTarget.title}
          open={Boolean(historyTarget)}
          onOpenChange={(open) => {
            if (!open) setHistoryTarget(null);
          }}
        />
      )}
    </div>
  );
}
