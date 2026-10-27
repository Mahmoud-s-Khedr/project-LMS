'use client';

import * as React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { RubricCriterionItem } from '../types';

interface RubricBuilderProps {
  isPublished: boolean;
  rubricEnabled: boolean;
  onToggleEnabled: (enabled: boolean) => void;
  criteria: RubricCriterionItem[];
  onChangeCriteria: (criteria: RubricCriterionItem[]) => void;
}

export function RubricBuilder({
  isPublished,
  rubricEnabled,
  onToggleEnabled,
  criteria,
  onChangeCriteria,
}: RubricBuilderProps) {
  const handleAddCriterion = () => {
    const nextItem: RubricCriterionItem = {
      id: `crit-${Date.now().toString(36)}`,
      label: `Criterion ${criteria.length + 1}`,
      description: '',
      maxPoints: '5.000',
    };
    onChangeCriteria([...criteria, nextItem]);
  };

  const handleUpdate = (idx: number, updates: Partial<RubricCriterionItem>) => {
    const next = [...criteria];
    next[idx] = { ...next[idx]!, ...updates };
    onChangeCriteria(next);
  };

  const handleRemove = (idx: number) => {
    onChangeCriteria(criteria.filter((_, i) => i !== idx));
  };

  const totalRubricPoints = criteria.reduce((acc, c) => acc + (parseFloat(c.maxPoints) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b pb-4">
        <div>
          <h3 className="text-base font-semibold">Evaluation Rubric</h3>
          <p className="text-xs text-muted-foreground">
            Structured scoring guidelines for subjective grading (essays, projects, and
            assignments).
          </p>
        </div>

        {!isPublished && (
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={rubricEnabled}
              onChange={(e) => onToggleEnabled(e.target.checked)}
              className="h-4 w-4 rounded text-primary"
            />
            Enable Assessment Rubric
          </label>
        )}
      </div>

      {!rubricEnabled ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Rubric is currently disabled. Graders evaluate submissions using standard overall points.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-muted-foreground">
              Total Rubric Criteria:{' '}
              <span className="font-bold text-foreground">{criteria.length}</span> | Total Rubric
              Points:{' '}
              <span className="font-mono font-bold text-foreground">
                {totalRubricPoints.toFixed(3)}
              </span>
            </div>
            {!isPublished && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddCriterion}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Add Criterion
              </Button>
            )}
          </div>

          {criteria.length === 0 ? (
            <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
              No criteria added. Add at least one criterion to define the grading rubric.
            </div>
          ) : (
            <div className="space-y-3">
              {criteria.map((c, idx) => (
                <div
                  key={c.id}
                  className="rounded-lg border p-4 space-y-3 bg-card hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 flex-1">
                      <div className="sm:col-span-3 space-y-1">
                        <Label className="text-xs">Criterion Title</Label>
                        <Input
                          placeholder="e.g. Conceptual Correctness"
                          value={c.label}
                          onChange={(e) => handleUpdate(idx, { label: e.target.value })}
                          disabled={isPublished}
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Max Points</Label>
                        <Input
                          type="number"
                          step="0.5"
                          min="0.1"
                          max="1000"
                          value={c.maxPoints}
                          onChange={(e) => handleUpdate(idx, { maxPoints: e.target.value })}
                          disabled={isPublished}
                          className="font-mono text-right"
                          required
                        />
                      </div>
                    </div>

                    {!isPublished && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemove(idx)}
                        className="h-8 w-8 text-destructive hover:text-destructive mt-5"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Description & Expectations (Optional)</Label>
                    <Textarea
                      rows={2}
                      placeholder="Explain performance benchmarks for high, average, or low points..."
                      value={c.description ?? ''}
                      onChange={(e) => handleUpdate(idx, { description: e.target.value })}
                      disabled={isPublished}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
