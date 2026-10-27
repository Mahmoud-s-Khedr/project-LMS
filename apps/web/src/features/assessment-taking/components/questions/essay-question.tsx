'use client';

import React, { useState, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import type { LearnerQuestion, QuestionResponse, RichText } from '../../types';

interface EssayQuestionProps {
  question: LearnerQuestion;
  value?: Extract<QuestionResponse, { type: 'ESSAY' }> | null;
  onChange: (val: Extract<QuestionResponse, { type: 'ESSAY' }>) => void;
  disabled?: boolean;
}

function documentToText(doc?: RichText | null): string {
  if (!doc || !doc.content) return '';
  return doc.content.map((block) => block.content?.map((n) => n.text).join('') || '').join('\n\n');
}

function textToDocument(text: string): RichText {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  if (paragraphs.length === 0) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
    };
  }

  return {
    type: 'doc',
    content: paragraphs.map((p) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: p.slice(0, 5000) }],
    })),
  };
}

export function EssayQuestion({ question, value, onChange, disabled = false }: EssayQuestionProps) {
  const [rawText, setRawText] = useState(() => documentToText(value?.document));

  useEffect(() => {
    setRawText(documentToText(value?.document));
  }, [value?.document]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setRawText(val);
    const doc = textToDocument(val);
    onChange({ type: 'ESSAY', document: doc });
  };

  const wordCount = rawText.trim() ? rawText.trim().split(/\s+/).length : 0;
  const charCount = rawText.length;

  return (
    <div className="space-y-2" data-testid="essay-question">
      <label
        htmlFor={`essay-${question.attemptQuestionId}`}
        className="text-xs text-muted-foreground"
      >
        Essay response:
      </label>
      <Textarea
        id={`essay-${question.attemptQuestionId}`}
        value={rawText}
        onChange={handleChange}
        disabled={disabled}
        placeholder="Compose your essay response here. Separate paragraphs with blank lines."
        rows={8}
        className="text-sm leading-relaxed"
        data-testid="essay-textarea"
      />
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>Word count: {wordCount} words</span>
        <span>{charCount} characters</span>
      </div>
    </div>
  );
}
