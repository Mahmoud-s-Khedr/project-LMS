'use client';

import React from 'react';
import { Flag } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SingleChoiceQuestion } from './questions/single-choice-question';
import { MultipleChoiceQuestion } from './questions/multiple-choice-question';
import { TrueFalseQuestion } from './questions/true-false-question';
import { ShortAnswerQuestion } from './questions/short-answer-question';
import { NumericQuestion } from './questions/numeric-question';
import { EssayQuestion } from './questions/essay-question';
import { FileUploadQuestion } from './questions/file-upload-question';
import { MatchingQuestion } from './questions/matching-question';
import { OrderingQuestion } from './questions/ordering-question';
import type { LearnerQuestion, QuestionResponse, SavedAnswer } from '../types';

interface QuestionCardProps {
  question: LearnerQuestion;
  index: number;
  totalQuestions: number;
  attemptId: string;
  workspaceId: string;
  currentAnswer?: SavedAnswer | null;
  isFlagged?: boolean;
  onToggleFlag?: () => void;
  onAnswerChange: (response: QuestionResponse, attachmentIds?: string[]) => void;
  allowedFileTypes?: string[];
  maxUploadBytes?: string;
  maxFiles?: number;
  disabled?: boolean;
}

export function QuestionCard({
  question,
  index,
  totalQuestions,
  attemptId,
  workspaceId,
  currentAnswer,
  isFlagged = false,
  onToggleFlag,
  onAnswerChange,
  allowedFileTypes,
  maxUploadBytes,
  maxFiles,
  disabled = false,
}: QuestionCardProps) {
  // Extract text from prompt AST
  const promptText =
    question.prompt?.content?.map((b) => b.content?.map((n) => n.text).join('')).join('\n\n') ||
    'Question prompt';

  const pointsFormatted = parseFloat(question.points).toFixed(1);

  return (
    <div
      className="flex flex-col gap-5 rounded-2xl border bg-card p-6 shadow-sm"
      data-testid={`question-card-${question.attemptQuestionId}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-foreground">
            Question {index + 1} of {totalQuestions}
          </span>
          {question.isRequired && (
            <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
              Required
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px]">
            {pointsFormatted} {parseFloat(question.points) === 1 ? 'pt' : 'pts'}
          </Badge>
        </div>

        <Button
          variant={isFlagged ? 'default' : 'ghost'}
          size="sm"
          onClick={onToggleFlag}
          className="h-8 gap-1.5 text-xs text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
          data-testid="flag-question-button"
        >
          <Flag className={`h-3.5 w-3.5 ${isFlagged ? 'fill-current' : ''}`} />
          <span>{isFlagged ? 'Flagged' : 'Flag for Review'}</span>
        </Button>
      </div>

      {/* Question Prompt */}
      <div className="text-sm md:text-base font-medium text-foreground whitespace-pre-wrap leading-relaxed">
        {promptText}
      </div>

      {/* Discriminated Question Input */}
      <div className="pt-2">
        {question.type === 'SINGLE_CHOICE' && (
          <SingleChoiceQuestion
            question={question}
            value={
              currentAnswer?.response as Extract<QuestionResponse, { type: 'SINGLE_CHOICE' }> | null
            }
            onChange={(val) => onAnswerChange(val)}
            disabled={disabled}
          />
        )}

        {question.type === 'MULTIPLE_CHOICE' && (
          <MultipleChoiceQuestion
            question={question}
            value={
              currentAnswer?.response as Extract<
                QuestionResponse,
                { type: 'MULTIPLE_CHOICE' }
              > | null
            }
            onChange={(val) => onAnswerChange(val)}
            disabled={disabled}
          />
        )}

        {question.type === 'TRUE_FALSE' && (
          <TrueFalseQuestion
            question={question}
            value={
              currentAnswer?.response as Extract<QuestionResponse, { type: 'TRUE_FALSE' }> | null
            }
            onChange={(val) => onAnswerChange(val)}
            disabled={disabled}
          />
        )}

        {question.type === 'SHORT_ANSWER' && (
          <ShortAnswerQuestion
            question={question}
            value={
              currentAnswer?.response as Extract<QuestionResponse, { type: 'SHORT_ANSWER' }> | null
            }
            onChange={(val) => onAnswerChange(val)}
            disabled={disabled}
          />
        )}

        {question.type === 'NUMERIC' && (
          <NumericQuestion
            question={question}
            value={currentAnswer?.response as Extract<QuestionResponse, { type: 'NUMERIC' }> | null}
            onChange={(val) => onAnswerChange(val)}
            disabled={disabled}
          />
        )}

        {question.type === 'ESSAY' && (
          <EssayQuestion
            question={question}
            value={currentAnswer?.response as Extract<QuestionResponse, { type: 'ESSAY' }> | null}
            onChange={(val) => onAnswerChange(val)}
            disabled={disabled}
          />
        )}

        {question.type === 'FILE_UPLOAD' && (
          <FileUploadQuestion
            question={question}
            attemptId={attemptId}
            workspaceId={workspaceId}
            value={
              currentAnswer?.response as Extract<QuestionResponse, { type: 'FILE_UPLOAD' }> | null
            }
            attachmentIds={currentAnswer?.attachmentIds}
            onChange={(val, attIds) => onAnswerChange(val, attIds)}
            allowedFileTypes={allowedFileTypes}
            maxUploadBytes={maxUploadBytes}
            maxFiles={maxFiles}
            disabled={disabled}
          />
        )}

        {question.type === 'MATCHING' && (
          <MatchingQuestion
            question={question}
            value={
              currentAnswer?.response as Extract<QuestionResponse, { type: 'MATCHING' }> | null
            }
            onChange={(val) => onAnswerChange(val)}
            disabled={disabled}
          />
        )}

        {question.type === 'ORDERING' && (
          <OrderingQuestion
            question={question}
            value={
              currentAnswer?.response as Extract<QuestionResponse, { type: 'ORDERING' }> | null
            }
            onChange={(val) => onAnswerChange(val)}
            disabled={disabled}
          />
        )}
      </div>
    </div>
  );
}
