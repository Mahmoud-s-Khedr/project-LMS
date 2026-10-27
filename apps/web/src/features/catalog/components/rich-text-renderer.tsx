import React from 'react';

interface RichTextMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface RichTextNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  content?: RichTextNode[];
  marks?: RichTextMark[];
}

interface RichTextDoc {
  type?: string;
  content?: RichTextNode[];
}

interface RichTextRendererProps {
  content: unknown;
  className?: string;
}

function renderTextWithMarks(node: RichTextNode, key: number | string): React.ReactNode {
  let element: React.ReactNode = node.text ?? '';

  if (node.marks && node.marks.length > 0) {
    for (const mark of node.marks) {
      if (mark.type === 'bold') {
        element = <strong key={`b-${key}`}>{element}</strong>;
      } else if (mark.type === 'italic') {
        element = <em key={`i-${key}`}>{element}</em>;
      } else if (mark.type === 'code') {
        element = (
          <code
            key={`c-${key}`}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground"
          >
            {element}
          </code>
        );
      } else if (mark.type === 'link' && typeof mark.attrs?.href === 'string') {
        element = (
          <a
            key={`a-${key}`}
            href={mark.attrs.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-4 hover:opacity-80"
          >
            {element}
          </a>
        );
      }
    }
  }

  return <React.Fragment key={key}>{element}</React.Fragment>;
}

function renderNode(node: RichTextNode, key: number | string): React.ReactNode {
  if (node.type === 'text') {
    return renderTextWithMarks(node, key);
  }

  const children = node.content?.map((child, i) => renderNode(child, i));

  switch (node.type) {
    case 'paragraph':
      return (
        <p key={key} className="mb-4 leading-relaxed text-muted-foreground last:mb-0">
          {children && children.length > 0 ? children : <br />}
        </p>
      );
    case 'heading': {
      const level = (node.attrs?.level as number) || 2;
      if (level === 1) {
        return (
          <h2 key={key} className="mt-6 mb-3 font-serif text-2xl font-bold tracking-tight">
            {children}
          </h2>
        );
      }
      if (level === 2) {
        return (
          <h3 key={key} className="mt-5 mb-2 font-serif text-xl font-semibold tracking-tight">
            {children}
          </h3>
        );
      }
      return (
        <h4 key={key} className="mt-4 mb-2 text-lg font-medium tracking-tight">
          {children}
        </h4>
      );
    }
    case 'bulletList':
      return (
        <ul key={key} className="mb-4 list-disc pl-6 space-y-1 text-muted-foreground">
          {children}
        </ul>
      );
    case 'orderedList':
      return (
        <ol key={key} className="mb-4 list-decimal pl-6 space-y-1 text-muted-foreground">
          {children}
        </ol>
      );
    case 'listItem':
      return (
        <li key={key} className="leading-relaxed">
          {children}
        </li>
      );
    case 'blockquote':
      return (
        <blockquote
          key={key}
          className="mb-4 border-l-4 border-primary/40 pl-4 italic text-muted-foreground"
        >
          {children}
        </blockquote>
      );
    case 'codeBlock':
      return (
        <pre key={key} className="mb-4 overflow-x-auto rounded-lg bg-muted p-4 font-mono text-sm">
          <code>{children}</code>
        </pre>
      );
    default:
      if (children && children.length > 0) {
        return <div key={key}>{children}</div>;
      }
      return null;
  }
}

export function RichTextRenderer({ content, className = '' }: RichTextRendererProps) {
  if (!content) return null;

  if (typeof content === 'string') {
    const paragraphs = content.split(/\n\s*\n/).filter(Boolean);
    if (paragraphs.length === 0) return null;
    return (
      <div className={`prose dark:prose-invert max-w-none ${className}`}>
        {paragraphs.map((p, idx) => (
          <p key={idx} className="mb-4 leading-relaxed text-muted-foreground last:mb-0">
            {p}
          </p>
        ))}
      </div>
    );
  }

  if (typeof content === 'object') {
    const doc = content as RichTextDoc;
    if (doc.content && Array.isArray(doc.content)) {
      return (
        <div className={`prose dark:prose-invert max-w-none ${className}`}>
          {doc.content.map((child, i) => renderNode(child, i))}
        </div>
      );
    }
  }

  return null;
}
