import { richTextSchema, type RichText } from '@lms/shared';

export type RichTextBlockType = 'paragraph' | 'heading' | 'blockquote' | 'codeBlock';
export type RichTextMark = 'bold' | 'italic' | 'code' | 'underline';

export interface RichTextNode {
  type: 'text';
  text: string;
  marks?: RichTextMark[];
}

export interface RichTextBlock {
  type: RichTextBlockType;
  content: RichTextNode[];
}

/**
 * Creates a valid empty RichText document.
 */
export function createEmptyRichText(): RichText {
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: '',
          },
        ],
      },
    ],
  };
}

/**
 * Converts a plain-text or simple markdown string into a valid RichText AST document.
 * Splits on double newlines to form separate paragraphs, parses `#` as headings,
 * `>` as blockquotes, and ```` or indented blocks as code blocks.
 */
export function plainTextToRichText(input: string): RichText {
  const trimmed = input.trim();
  if (!trimmed) {
    return createEmptyRichText();
  }

  const rawBlocks = trimmed.split(/\n\n+/);
  const content: RichTextBlock[] = [];

  for (const raw of rawBlocks.slice(0, 200)) {
    const blockText = raw.trim();
    if (!blockText) continue;

    if (blockText.startsWith('# ') || blockText.startsWith('## ') || blockText.startsWith('### ')) {
      const headingText = blockText.replace(/^#+\s*/, '').slice(0, 5000);
      content.push({
        type: 'heading',
        content: [{ type: 'text', text: headingText }],
      });
    } else if (blockText.startsWith('> ') || blockText.startsWith('>')) {
      const quoteText = blockText.replace(/^>\s*/, '').slice(0, 5000);
      content.push({
        type: 'blockquote',
        content: [{ type: 'text', text: quoteText }],
      });
    } else if (blockText.startsWith('```') && blockText.endsWith('```')) {
      const codeText = blockText.slice(3, -3).replace(/^.*\n/, '').slice(0, 10000);
      content.push({
        type: 'codeBlock',
        content: [{ type: 'text', text: codeText }],
      });
    } else {
      content.push({
        type: 'paragraph',
        content: [{ type: 'text', text: blockText.slice(0, 5000) }],
      });
    }
  }

  const doc: RichText = {
    type: 'doc',
    content: content.length > 0 ? content : [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }],
  };

  const parsed = richTextSchema.safeParse(doc);
  return parsed.success ? parsed.data : createEmptyRichText();
}

/**
 * Extracts plain-text representation from a RichText AST document.
 */
export function richTextToPlainText(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return '';
  const parsed = richTextSchema.safeParse(doc);
  if (!parsed.success) return '';

  return parsed.data.content
    .map((block) => {
      const prefix =
        block.type === 'heading'
          ? '# '
          : block.type === 'blockquote'
            ? '> '
            : block.type === 'codeBlock'
              ? '```\n'
              : '';
      const suffix = block.type === 'codeBlock' ? '\n```' : '';
      const innerText = block.content.map((node) => node.text).join('');
      return `${prefix}${innerText}${suffix}`;
    })
    .join('\n\n');
}

/**
 * Computes the total character count across all text nodes.
 */
export function countRichTextCharacters(doc: unknown): number {
  if (!doc || typeof doc !== 'object') return 0;
  const parsed = richTextSchema.safeParse(doc);
  if (!parsed.success) return 0;

  return parsed.data.content.reduce((total, block) => {
    return total + block.content.reduce((bTotal, node) => bTotal + node.text.length, 0);
  }, 0);
}

/**
 * Validates and sanitizes a document payload, ensuring strict schema conformance.
 */
export function sanitizeRichText(input: unknown): RichText {
  const result = richTextSchema.safeParse(input);
  if (result.success) {
    return result.data;
  }
  if (typeof input === 'string') {
    return plainTextToRichText(input);
  }
  return createEmptyRichText();
}
