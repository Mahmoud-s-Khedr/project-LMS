import { describe, expect, it } from 'vitest';
import {
  plainTextToRichText,
  richTextToPlainText,
  countRichTextCharacters,
  createEmptyRichText,
  sanitizeRichText,
} from './utils/rich-text';

describe('Rich Text Utilities', () => {
  it('creates an empty RichText doc conforming to schema', () => {
    const emptyDoc = createEmptyRichText();
    expect(emptyDoc.type).toBe('doc');
    expect(emptyDoc.content).toBeInstanceOf(Array);
    expect(emptyDoc.content.length).toBeGreaterThan(0);
  });

  it('converts markdown headings, blockquotes, and paragraphs to RichText AST', () => {
    const markdown = `# Architecture Overview\n\nThis is a standard paragraph with essential context.\n\n> Important quote regarding design rules\n\n\`\`\`\nconsole.log("Hello world");\n\`\`\``;

    const doc = plainTextToRichText(markdown);
    expect(doc.type).toBe('doc');
    expect(doc.content).toHaveLength(4);

    expect(doc.content[0]?.type).toBe('heading');
    expect(doc.content[0]?.content[0]?.text).toBe('Architecture Overview');

    expect(doc.content[1]?.type).toBe('paragraph');
    expect(doc.content[1]?.content[0]?.text).toContain('This is a standard paragraph');

    expect(doc.content[2]?.type).toBe('blockquote');
    expect(doc.content[2]?.content[0]?.text).toContain('Important quote');

    expect(doc.content[3]?.type).toBe('codeBlock');
    expect(doc.content[3]?.content[0]?.text).toContain('console.log');
  });

  it('re-extracts plain text from AST without data loss', () => {
    const original = `# Title\n\nParagraph 1\n\n> Quote`;
    const doc = plainTextToRichText(original);
    const roundTripped = richTextToPlainText(doc);

    expect(roundTripped).toContain('# Title');
    expect(roundTripped).toContain('Paragraph 1');
    expect(roundTripped).toContain('> Quote');
  });

  it('accurately counts characters across nodes', () => {
    const doc = plainTextToRichText('One Two Three');
    expect(countRichTextCharacters(doc)).toBe(13);
  });

  it('sanitizes invalid or malicious structures into a safe fallback doc', () => {
    const malicious = {
      type: 'script',
      danger: '<script>alert("xss")</script>',
    };
    const sanitized = sanitizeRichText(malicious);
    expect(sanitized.type).toBe('doc');
    expect(sanitized.content[0]?.type).toBe('paragraph');
  });
});
