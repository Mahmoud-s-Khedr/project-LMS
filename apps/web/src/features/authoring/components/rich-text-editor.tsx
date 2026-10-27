'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Heading,
  Quote,
  Code,
  Eye,
  Edit3,
} from 'lucide-react';
import {
  plainTextToRichText,
  richTextToPlainText,
  countRichTextCharacters,
} from '../utils/rich-text';
import type { RichText } from '../types';

interface RichTextEditorProps {
  value: RichText | null | undefined;
  onChange: (doc: RichText) => void;
  placeholder?: string;
  minHeight?: string;
  disabled?: boolean;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder = 'Write content here (supports Markdown headings #, quotes >, code blocks ```)...',
  minHeight = 'min-h-[160px]',
  disabled = false,
}: RichTextEditorProps) {
  const [activeTab, setActiveTab] = React.useState<'write' | 'preview'>('write');
  const [rawText, setRawText] = React.useState<string>(() => richTextToPlainText(value));

  // Sync external changes if different
  React.useEffect(() => {
    const currentFromValue = richTextToPlainText(value);
    if (currentFromValue !== rawText && value) {
      setRawText(currentFromValue);
    }
  }, [value, rawText]);

  const handleTextChange = (newText: string) => {
    setRawText(newText);
    const doc = plainTextToRichText(newText);
    onChange(doc);
  };

  const insertPrefix = (prefix: string) => {
    const next = rawText ? `${rawText}\n\n${prefix} ` : `${prefix} `;
    handleTextChange(next);
  };

  const insertCodeBlock = () => {
    const next = rawText
      ? `${rawText}\n\n\`\`\`\n// code snippet\n\`\`\``
      : `\`\`\`\n// code snippet\n\`\`\``;
    handleTextChange(next);
  };

  const charCount = countRichTextCharacters(value);

  return (
    <div className="rounded-md border border-input bg-background overflow-hidden">
      <div className="flex flex-wrap items-center justify-between border-b bg-muted/40 px-3 py-1.5 gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || activeTab === 'preview'}
            onClick={() => insertPrefix('#')}
            title="Heading 1"
            className="h-8 w-8 p-0"
            aria-label="Insert Heading"
          >
            <Heading className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || activeTab === 'preview'}
            onClick={() => insertPrefix('>')}
            title="Blockquote"
            className="h-8 w-8 p-0"
            aria-label="Insert Blockquote"
          >
            <Quote className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || activeTab === 'preview'}
            onClick={insertCodeBlock}
            title="Code Block"
            className="h-8 w-8 p-0"
            aria-label="Insert Code Block"
          >
            <Code className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground font-mono">
            {charCount} / 100,000 chars
          </span>

          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'write' | 'preview')}>
            <TabsList className="h-8">
              <TabsTrigger value="write" className="h-7 text-xs px-2.5 flex items-center gap-1.5">
                <Edit3 className="h-3 w-3" />
                Write
              </TabsTrigger>
              <TabsTrigger value="preview" className="h-7 text-xs px-2.5 flex items-center gap-1.5">
                <Eye className="h-3 w-3" />
                Preview
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {activeTab === 'write' ? (
        <Textarea
          value={rawText}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={`border-0 rounded-none resize-y focus-visible:ring-0 focus-visible:ring-offset-0 p-3 font-sans text-sm ${minHeight}`}
        />
      ) : (
        <div className={`p-4 prose prose-sm max-w-none dark:prose-invert overflow-y-auto ${minHeight}`}>
          {value?.content && value.content.length > 0 ? (
            value.content.map((block, idx) => {
              const text = block.content.map((n) => n.text).join('');
              if (block.type === 'heading') {
                return (
                  <h3 key={idx} className="font-semibold text-lg my-2">
                    {text}
                  </h3>
                );
              }
              if (block.type === 'blockquote') {
                return (
                  <blockquote
                    key={idx}
                    className="border-l-4 border-muted-foreground/40 pl-3 italic my-2 text-muted-foreground"
                  >
                    {text}
                  </blockquote>
                );
              }
              if (block.type === 'codeBlock') {
                return (
                  <pre key={idx} className="bg-muted rounded p-3 text-xs font-mono my-2 overflow-x-auto">
                    <code>{text}</code>
                  </pre>
                );
              }
              return (
                <p key={idx} className="my-1.5 leading-relaxed">
                  {text || <span className="text-muted-foreground italic">(empty paragraph)</span>}
                </p>
              );
            })
          ) : (
            <p className="text-muted-foreground italic text-sm">No content authored yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
