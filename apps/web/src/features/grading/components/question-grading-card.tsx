'use client';

import * as React from 'react';
import { FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { richTextToText } from '@/features/assessment-authoring/utils';
import { useDownloadAttachmentMutation } from '../hooks';
import type { StaffAttempt } from '@lms/shared';
import type { AttemptQuestionGradeInput } from '../types';

interface QuestionGradingCardProps {
  workspaceId: string;
  attemptId: string;
  questionItem: StaffAttempt['questions'][number];
  index: number;
  gradeInput: AttemptQuestionGradeInput;
  onChangeGradeInput: (input: AttemptQuestionGradeInput) => void;
  rubric?: StaffAttempt['rubric'];
  disabled?: boolean;
}

export function QuestionGradingCard({
  workspaceId,
  attemptId,
  questionItem,
  index,
  gradeInput,
  onChangeGradeInput,
  rubric,
  disabled = false,
}: QuestionGradingCardProps) {
  const { delivery, authorVersion, answer } = questionItem;
  const maxPoints = delivery.points;

  const downloadMutation = useDownloadAttachmentMutation(workspaceId, attemptId);

  const promptText = richTextToText(delivery.prompt);
  const explanationText = richTextToText(authorVersion.payload.explanation);

  // Attachment download handler
  const handleDownloadAttachment = async (assetId: string) => {
    try {
      const res = await downloadMutation.mutateAsync(assetId);
      if (res.url) {
        window.open(res.url, '_blank', 'noopener,noreferrer');
      }
    } catch (err: unknown) {
      alert(`Download failed: ${err instanceof Error ? err.message : 'Error'}`);
    }
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="bg-muted/20 border-b pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              Q{index + 1}
            </Badge>
            <Badge variant="secondary" className="text-xs">
              {delivery.type}
            </Badge>
            {delivery.isRequired && (
              <Badge variant="ghost" className="text-[10px] text-muted-foreground">
                Required
              </Badge>
            )}
          </div>
          <div className="text-xs font-mono font-semibold text-muted-foreground">
            Max Points: <span className="text-foreground">{maxPoints}</span>
          </div>
        </div>
        <CardTitle className="text-sm font-medium mt-2 leading-relaxed">
          {promptText || 'No prompt content'}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {/* STUDENT SUBMISSION SECTION */}
        <div className="rounded-lg border p-4 bg-background space-y-2">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Student Response
          </div>

          {!answer || !answer.response ? (
            <div className="text-sm italic text-muted-foreground">
              No answer recorded (Unanswered / Skipped).
            </div>
          ) : (
            <div className="text-sm space-y-2">
              {/* Single Choice */}
              {answer.response.type === 'SINGLE_CHOICE' && (
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Selected Option:</span>
                  <Badge variant="outline">{answer.response.optionKey}</Badge>
                </div>
              )}

              {/* Multiple Choice */}
              {answer.response.type === 'MULTIPLE_CHOICE' && (
                <div>
                  <span className="font-semibold">Selected Options:</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {answer.response.optionKeys.map((k) => (
                      <Badge key={k} variant="outline">
                        {k}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* True / False */}
              {answer.response.type === 'TRUE_FALSE' && (
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Selected Value:</span>
                  <Badge variant="outline">{answer.response.value ? 'True' : 'False'}</Badge>
                </div>
              )}

              {/* Short Answer */}
              {answer.response.type === 'SHORT_ANSWER' && (
                <div className="rounded bg-muted/40 p-2 font-mono text-xs">
                  {answer.response.text}
                </div>
              )}

              {/* Numeric */}
              {answer.response.type === 'NUMERIC' && (
                <div className="font-mono text-xs font-semibold">{answer.response.value}</div>
              )}

              {/* Essay */}
              {answer.response.type === 'ESSAY' && (
                <div className="rounded border bg-muted/20 p-3 text-sm whitespace-pre-wrap font-serif leading-relaxed">
                  {richTextToText(answer.response.document) || 'Empty document.'}
                </div>
              )}

              {/* File Upload */}
              {answer.response.type === 'FILE_UPLOAD' && (
                <div className="space-y-2">
                  {answer.response.note && (
                    <p className="text-xs text-muted-foreground italic">
                      Note: &quot;{answer.response.note}&quot;
                    </p>
                  )}

                  <div className="space-y-1.5">
                    <Label className="text-xs">Uploaded Attachments:</Label>
                    {answer.attachmentIds.length === 0 ? (
                      <div className="text-xs text-muted-foreground">No files attached.</div>
                    ) : (
                      answer.attachmentIds.map((assetId, i) => (
                        <div
                          key={assetId}
                          className="flex items-center justify-between rounded border p-2 bg-card text-xs"
                        >
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <span className="font-mono">
                              Submission File #{i + 1} ({assetId.slice(0, 8)}...)
                            </span>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownloadAttachment(assetId)}
                            disabled={downloadMutation.isPending}
                            className="h-7 text-xs gap-1"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Download
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Saved timestamp */}
              <div className="text-[10px] text-muted-foreground pt-1">
                Saved at: {new Date(answer.savedAt).toLocaleString()}
              </div>
            </div>
          )}
        </div>

        {/* STAFF AUTHOR KEY PROJECTION */}
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs space-y-1">
          <div className="font-semibold text-primary">Author Solution / Answer Key</div>
          {authorVersion.payload.type === 'SINGLE_CHOICE' && (
            <div>
              Correct Option: {authorVersion.payload.answerKey.correctOptionKeys.join(', ')}
            </div>
          )}
          {authorVersion.payload.type === 'MULTIPLE_CHOICE' && (
            <div>
              Correct Options: {authorVersion.payload.answerKey.correctOptionKeys.join(', ')}
            </div>
          )}
          {authorVersion.payload.type === 'SHORT_ANSWER' && (
            <div>Accepted: {authorVersion.payload.answerKey.accepted.join(' | ')}</div>
          )}
          {authorVersion.payload.type === 'NUMERIC' && (
            <div>
              Value: {authorVersion.payload.answerKey.value} (±
              {authorVersion.payload.answerKey.absoluteTolerance})
            </div>
          )}
          {explanationText && (
            <div className="text-muted-foreground pt-0.5">
              <span className="font-semibold text-foreground">Explanation:</span> {explanationText}
            </div>
          )}
        </div>

        {rubric && answer && ['ESSAY', 'FILE_UPLOAD'].includes(delivery.type) && (
          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-xs font-semibold">Rubric scores</legend>
            {rubric.criteria.map((criterion) => (
              <div key={criterion.id} className="space-y-1">
                <Label htmlFor={`rubric-${delivery.attemptQuestionId}-${criterion.id}`}>
                  {criterion.label} (Max: {criterion.maxPoints})
                </Label>
                {criterion.description && (
                  <p className="text-xs text-muted-foreground">{criterion.description}</p>
                )}
                <Input
                  id={`rubric-${delivery.attemptQuestionId}-${criterion.id}`}
                  type="number"
                  min="0"
                  max={criterion.maxPoints}
                  step="0.001"
                  disabled={disabled}
                  value={
                    gradeInput.rubricScores?.find((score) => score.criterionId === criterion.id)
                      ?.points ?? ''
                  }
                  onChange={(e) => {
                    const scores = (gradeInput.rubricScores ?? []).filter(
                      (score) => score.criterionId !== criterion.id,
                    );
                    if (e.target.value !== '')
                      scores.push({ criterionId: criterion.id, points: e.target.value });
                    onChangeGradeInput({
                      ...gradeInput,
                      rubricScores: scores,
                      awardedPoints: scores
                        .reduce((sum, score) => sum + Number(score.points), 0)
                        .toFixed(3),
                    });
                  }}
                />
              </div>
            ))}
          </fieldset>
        )}

        {/* GRADING EVALUATION CONTROLS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t">
          <div className="space-y-1.5">
            <Label htmlFor={`points-${delivery.attemptQuestionId}`} className="text-xs">
              Awarded Points (Max: {maxPoints})
            </Label>
            <Input
              id={`points-${delivery.attemptQuestionId}`}
              type="number"
              step="0.1"
              min="0"
              max={maxPoints}
              value={gradeInput.awardedPoints}
              onChange={(e) =>
                onChangeGradeInput({
                  ...gradeInput,
                  awardedPoints: e.target.value,
                })
              }
              disabled={disabled}
              className="font-mono"
            />
          </div>

          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor={`feedback-${delivery.attemptQuestionId}`} className="text-xs">
              Question Feedback / Comments
            </Label>
            <Textarea
              id={`feedback-${delivery.attemptQuestionId}`}
              rows={2}
              placeholder="Constructive feedback for the student..."
              value={gradeInput.feedback ?? ''}
              onChange={(e) =>
                onChangeGradeInput({
                  ...gradeInput,
                  feedback: e.target.value || null,
                })
              }
              disabled={disabled}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
