'use client';

import React from 'react';
import type { RichText } from '@lms/shared';
import { cn } from '@/lib/utils';

interface TextLessonViewerProps {
  content: RichText | unknown;
  className?: string;
}

export function TextLessonViewer({ content, className }: TextLessonViewerProps) {
  if (!content || typeof content !== 'object' || !('content' in (content as Record<string, unknown>))) {
    return (
      <div className="rounded-xl border border-dashed p-8 text-center text-xs text-muted-foreground">
        No text content provided for this lesson.
      </div>
    );
  }

  const doc = content as RichText;

  return (
    <article
      className={cn(
        'prose prose-neutral dark:prose-invert max-w-3xl mx-auto space-y-4 py-4 text-foreground/90 leading-relaxed',
        className,
      )}
      data-testid="text-lesson-viewer"
    >
      {doc.content.map((block, bIdx) => {
        switch (block.type) {
          case 'heading':
            return (
              <h2
                key={bIdx}
                className="mt-6 mb-3 text-xl font-bold tracking-tight text-foreground"
              >
                {block.content.map((n, nIdx) => (
                  <span key={nIdx}>{n.text}</span>
                ))}
              </h2>
            );
          case 'blockquote':
            return (
              <blockquote
                key={bIdx}
                className="border-l-4 border-primary/60 pl-4 py-1 italic text-muted-foreground bg-muted/20 rounded-r"
              >
                {block.content.map((n, nIdx) => (
                  <span key={nIdx}>{n.text}</span>
                ))}
              </blockquote>
            );
          case 'codeBlock':
            return (
              <pre
                key={bIdx}
                className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs font-mono text-zinc-100 dark:bg-zinc-900 border"
              >
                <code>
                  {block.content.map((n, nIdx) => (
                    <span key={nIdx}>{n.text}</span>
                  ))}
                </code>
              </pre>
            );
          case 'paragraph':
          default:
            return (
              <p key={bIdx} className="text-sm md:text-base leading-7">
                {block.content.map((n, nIdx) => {
                  let textElem: React.ReactNode = n.text;
                  if (n.marks) {
                    if (n.marks.includes('bold')) {
                      textElem = <strong>{textElem}</strong>;
                    }
                    if (n.marks.includes('italic')) {
                      textElem = <em>{textElem}</em>;
                    }
                    if (n.marks.includes('underline')) {
                      textElem = <u>{textElem}</u>;
                    }
                    if (n.marks.includes('code')) {
                      textElem = (
                        <code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-primary">
                          {textElem}
                        </code>
                      );
                    }
                  }
                  return <React.Fragment key={nIdx}>{textElem}</React.Fragment>;
                })}
              </p>
            );
        }
      })}
    </article>
  );
}
