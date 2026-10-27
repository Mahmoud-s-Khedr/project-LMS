'use client';

import * as React from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Search, Check } from 'lucide-react';
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatPoints, richTextToText } from '../utils';
import { useQuestionBanksQuery, useQuestionsInBankQuery } from '../hooks';
import type { FixedQuestionItem } from '../types';
import type { AuthorQuestion } from '@lms/shared';

interface FixedQuestionsManagerProps {
  workspaceId: string;
  isPublished: boolean;
  questions: FixedQuestionItem[];
  onChange: (questions: FixedQuestionItem[]) => void;
  onSave?: () => Promise<void>;
  isSaving?: boolean;
}

export function FixedQuestionsManager({
  workspaceId,
  isPublished,
  questions,
  onChange,
  onSave,
  isSaving = false,
}: FixedQuestionsManagerProps) {
  const [selectorOpen, setSelectorOpen] = React.useState(false);
  const [selectedBankId, setSelectedBankId] = React.useState<string>('');
  const [questionSearch, setQuestionSearch] = React.useState('');

  // Fetch available banks
  const { data: banksData } = useQuestionBanksQuery(workspaceId, {}, { enabled: selectorOpen });
  const rawBanks = banksData?.data;
  const banks = React.useMemo(() => rawBanks ?? [], [rawBanks]);

  // Default to first bank when banks load
  React.useEffect(() => {
    if (banks.length > 0 && !selectedBankId) {
      setSelectedBankId(banks[0]?.id ?? '');
    }
  }, [banks, selectedBankId]);

  // Fetch questions in selected bank
  const { data: bankQuestionsData, isLoading: loadingBankQuestions } = useQuestionsInBankQuery(
    workspaceId,
    selectedBankId,
    { search: questionSearch || undefined },
    { enabled: selectorOpen && Boolean(selectedBankId) },
  );
  const availableQuestions = bankQuestionsData?.data ?? [];

  // Track already selected versions
  const selectedVersionIds = new Set(questions.map((q) => q.questionVersionId));

  const handleAddQuestion = (q: AuthorQuestion) => {
    const nextItem: FixedQuestionItem = {
      questionVersionId: q.latestVersion.id,
      points: formatPoints(q.latestVersion.payload.defaultPoints),
      position: questions.length,
      isRequired: true,
      questionTitle: q.title,
      questionType: q.latestVersion.payload.type,
    };
    onChange([...questions, nextItem]);
  };

  const handleRemoveQuestion = (idx: number) => {
    const next = questions.filter((_, i) => i !== idx).map((item, i) => ({ ...item, position: i }));
    onChange(next);
  };

  const handleMove = (fromIdx: number, toIdx: number) => {
    const next = [...questions];
    const item = next[fromIdx]!;
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, item);
    onChange(next.map((q, idx) => ({ ...q, position: idx })));
  };

  const handleUpdatePoints = (idx: number, points: string) => {
    const next = [...questions];
    next[idx] = { ...next[idx]!, points };
    onChange(next);
  };

  const handleToggleRequired = (idx: number) => {
    const next = [...questions];
    next[idx] = { ...next[idx]!, isRequired: !next[idx]!.isRequired };
    onChange(next);
  };

  const totalPoints = questions.reduce((acc, q) => acc + (parseFloat(q.points) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Fixed Questions</h3>
          <p className="text-xs text-muted-foreground">
            Questions that every student receives in this assessment version. Total points:{' '}
            <span className="font-mono font-bold text-foreground">{totalPoints.toFixed(3)}</span>
          </p>
        </div>
        {!isPublished && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectorOpen(true)}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add From Question Bank
            </Button>
            {onSave && (
              <Button type="button" size="sm" onClick={onSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Questions'}
              </Button>
            )}
          </div>
        )}
      </div>

      {questions.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No fixed questions added yet. You can add specific questions or use randomized question
          pools.
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Question Title / Type</TableHead>
                <TableHead className="w-28 text-center">Required</TableHead>
                <TableHead className="w-32 text-right">Points</TableHead>
                {!isPublished && <TableHead className="w-28 text-right">Order / Delete</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.map((q, idx) => (
                <TableRow key={`${q.questionVersionId}-${idx}`}>
                  <TableCell className="text-center font-mono text-xs text-muted-foreground">
                    {idx + 1}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm line-clamp-1">
                      {q.questionTitle || `Question (${q.questionVersionId.slice(0, 8)})`}
                    </div>
                    {q.questionType && (
                      <Badge variant="outline" className="text-[10px] mt-0.5">
                        {q.questionType}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <input
                      type="checkbox"
                      checked={q.isRequired}
                      onChange={() => handleToggleRequired(idx)}
                      disabled={isPublished}
                      className="h-4 w-4 rounded"
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={q.points}
                      onChange={(e) => handleUpdatePoints(idx, e.target.value)}
                      disabled={isPublished}
                      className="h-8 w-24 text-right font-mono ml-auto"
                    />
                  </TableCell>
                  {!isPublished && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={idx === 0}
                          onClick={() => handleMove(idx, idx - 1)}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={idx === questions.length - 1}
                          onClick={() => handleMove(idx, idx + 1)}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveQuestion(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Select Question From Bank Dialog */}
      <Dialog open={selectorOpen} onOpenChange={setSelectorOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Select Questions from Bank</DialogTitle>
            <DialogDescription>
              Choose questions to link to this assessment version. The latest immutable version
              snapshot is added.
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-2 py-2">
            <Select value={selectedBankId} onValueChange={setSelectedBankId}>
              <SelectTrigger className="w-1/2">
                <SelectValue placeholder="Choose question bank" />
              </SelectTrigger>
              <SelectContent>
                {banks.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title..."
                value={questionSearch}
                onChange={(e) => setQuestionSearch(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 border rounded-md p-2 min-h-[250px]">
            {loadingBankQuestions ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Loading bank questions...
              </div>
            ) : availableQuestions.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No active questions found in this bank.
              </div>
            ) : (
              availableQuestions.map((q) => {
                const isSelected = selectedVersionIds.has(q.latestVersion.id);
                return (
                  <div
                    key={q.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{q.title}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {q.latestVersion.payload.type}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          v{q.latestVersion.version}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {richTextToText(q.latestVersion.payload.prompt)}
                      </p>
                    </div>

                    <Button
                      type="button"
                      size="sm"
                      variant={isSelected ? 'secondary' : 'default'}
                      disabled={isSelected}
                      onClick={() => handleAddQuestion(q)}
                      className="gap-1 ml-4"
                    >
                      {isSelected ? (
                        <>
                          <Check className="h-3.5 w-3.5" /> Added
                        </>
                      ) : (
                        'Add'
                      )}
                    </Button>
                  </div>
                );
              })
            )}
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" onClick={() => setSelectorOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
