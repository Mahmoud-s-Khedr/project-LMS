'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { formatPoints } from '../utils';
import { useQuestionBanksQuery } from '../hooks';
import { QuestionType, type PoolConfigItem } from '../types';

interface PoolsManagerProps {
  workspaceId: string;
  isPublished: boolean;
  pools: PoolConfigItem[];
  onChange: (pools: PoolConfigItem[]) => void;
  onSave?: () => Promise<void>;
  isSaving?: boolean;
}

export function PoolsManager({
  workspaceId,
  isPublished,
  pools,
  onChange,
  onSave,
  isSaving = false,
}: PoolsManagerProps) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);

  // Form states
  const [bankId, setBankId] = React.useState('');
  const [count, setCount] = React.useState('5');
  const [pointsEach, setPointsEach] = React.useState('2.000');
  const [questionType, setQuestionType] = React.useState<string>('ANY');
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);

  const { data: banksData } = useQuestionBanksQuery(workspaceId, {});
  const rawBanks = banksData?.data;
  const banks = React.useMemo(() => rawBanks ?? [], [rawBanks]);

  const bankNameMap = React.useMemo(() => {
    const map = new Map<string, string>();
    banks.forEach((b) => map.set(b.id, b.name));
    return map;
  }, [banks]);

  const handleOpenAdd = () => {
    setEditingIndex(null);
    setBankId(banks[0]?.id ?? '');
    setCount('5');
    setPointsEach('2.000');
    setQuestionType('ANY');
    setTags([]);
    setTagInput('');
    setFormError(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (index: number) => {
    const pool = pools[index];
    if (!pool) return;
    setEditingIndex(index);
    setBankId(pool.bankId);
    setCount(String(pool.count));
    setPointsEach(pool.pointsEach);
    setQuestionType(pool.questionType ?? 'ANY');
    setTags(pool.tags);
    setTagInput('');
    setFormError(null);
    setDialogOpen(true);
  };

  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (t: string) => {
    setTags(tags.filter((item) => item !== t));
  };

  const handleSavePool = () => {
    if (!bankId) {
      setFormError('Please select a question bank.');
      return;
    }
    const countNum = parseInt(count, 10);
    if (isNaN(countNum) || countNum < 1) {
      setFormError('Question count must be at least 1.');
      return;
    }

    const newPoolItem: PoolConfigItem = {
      bankId,
      position: editingIndex !== null ? editingIndex : pools.length,
      count: countNum,
      pointsEach: formatPoints(pointsEach),
      tags,
      questionType: questionType === 'ANY' ? null : questionType,
      bankName: bankNameMap.get(bankId) ?? 'Question Bank',
    };

    if (editingIndex !== null) {
      const next = [...pools];
      next[editingIndex] = newPoolItem;
      onChange(next);
    } else {
      onChange([...pools, newPoolItem]);
    }

    setDialogOpen(false);
  };

  const handleRemovePool = (index: number) => {
    const next = pools.filter((_, i) => i !== index).map((p, i) => ({ ...p, position: i }));
    onChange(next);
  };

  const totalPoolPoints = pools.reduce(
    (acc, p) => acc + p.count * (parseFloat(p.pointsEach) || 0),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Random Question Pools</h3>
          <p className="text-xs text-muted-foreground">
            Draw randomized questions without replacement per attempt. Total pool points:{' '}
            <span className="font-mono font-bold text-foreground">
              {totalPoolPoints.toFixed(3)}
            </span>
          </p>
        </div>
        {!isPublished && (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleOpenAdd}
              className="gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Add Question Pool
            </Button>
            {onSave && (
              <Button type="button" size="sm" onClick={onSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Save Pools'}
              </Button>
            )}
          </div>
        )}
      </div>

      {pools.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No question pools configured. Pools allow sampling distinct randomized questions for each
          student.
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>Bank / Sampling Criteria</TableHead>
                <TableHead className="text-center">Draw Count</TableHead>
                <TableHead className="text-right">Points Each</TableHead>
                <TableHead className="text-right">Total Points</TableHead>
                {!isPublished && <TableHead className="w-24 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pools.map((p, idx) => {
                const bankName = p.bankName || bankNameMap.get(p.bankId) || p.bankId.slice(0, 8);
                const subTotal = (p.count * parseFloat(p.pointsEach)).toFixed(3);
                return (
                  <TableRow key={idx}>
                    <TableCell className="text-center font-mono text-xs text-muted-foreground">
                      {idx + 1}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium text-sm">{bankName}</div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {p.questionType && (
                          <Badge variant="outline" className="text-[10px]">
                            {p.questionType}
                          </Badge>
                        )}
                        {p.tags.map((t) => (
                          <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {t}
                          </Badge>
                        ))}
                        {!p.questionType && p.tags.length === 0 && (
                          <span className="text-xs text-muted-foreground">
                            Any eligible question
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-mono font-medium">{p.count}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{p.pointsEach}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold">
                      {subTotal}
                    </TableCell>
                    {!isPublished && (
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenEdit(idx)}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => handleRemovePool(idx)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pool Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingIndex !== null ? 'Configure Question Pool' : 'Create Question Pool'}
            </DialogTitle>
            <DialogDescription>
              Randomly draws questions matching specific criteria at the start of each student
              attempt.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {formError && (
              <div
                role="alert"
                className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive"
              >
                {formError}
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Source Question Bank</Label>
              <Select value={bankId} onValueChange={setBankId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select question bank" />
                </SelectTrigger>
                <SelectContent>
                  {banks.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pool-count">Draw Count</Label>
                <Input
                  id="pool-count"
                  type="number"
                  min="1"
                  max="500"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="pool-points">Points Each</Label>
                <Input
                  id="pool-points"
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="1000"
                  value={pointsEach}
                  onChange={(e) => setPointsEach(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Question Type Filter</Label>
              <Select value={questionType} onValueChange={setQuestionType}>
                <SelectTrigger>
                  <SelectValue placeholder="Any type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANY">Any Question Type</SelectItem>
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
            </div>

            <div className="space-y-1.5">
              <Label>Tag Filters (Optional)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. database, hard"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                />
                <Button type="button" variant="outline" size="sm" onClick={handleAddTag}>
                  Add
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1 px-2 py-0.5 text-xs">
                    {t}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSavePool}>
              {editingIndex !== null ? 'Save Pool' : 'Add Pool'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
