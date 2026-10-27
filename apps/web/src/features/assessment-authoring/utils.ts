import type { RichText } from '@lms/shared';
import type { AssessmentVersionConfig, AuthorQuestion } from '@lms/shared';

/**
 * Converts a plain string to a strictly valid RichText document object.
 */
export function textToRichText(text: string): RichText {
  const trimmed = text.trim();
  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: trimmed ? [{ type: 'text', text: trimmed }] : [],
      },
    ],
  };
}

/**
 * Safely extracts plain text from a RichText document structure.
 */
export function richTextToText(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return '';
  const root = doc as {
    content?: Array<{
      type?: string;
      content?: Array<{ text?: string }>;
    }>;
  };
  if (!Array.isArray(root.content)) return '';
  return root.content
    .map((block) => {
      if (Array.isArray(block.content)) {
        return block.content.map((c) => c.text ?? '').join('');
      }
      return '';
    })
    .filter(Boolean)
    .join('\n\n');
}

/**
 * Formats a decimal points value into standard 3-decimal string (e.g. "10.000").
 */
export function formatPoints(points: string | number | undefined | null): string {
  if (points === undefined || points === null || points === '') return '0.000';
  const num = typeof points === 'number' ? points : parseFloat(points);
  if (isNaN(num)) return '0.000';
  return num.toFixed(3);
}

/**
 * Formats a decimal percent value into standard 2-decimal string (e.g. "75.00").
 */
export function formatPercent(percent: string | number | undefined | null): string {
  if (percent === undefined || percent === null || percent === '') return '0.00';
  const num = typeof percent === 'number' ? percent : parseFloat(percent);
  if (isNaN(num)) return '0.00';
  return num.toFixed(2);
}

/**
 * Generates an ETag matching the backend assessment-domain ETag helper.
 * Format: `"${id}:${new Date(updatedAt).getTime()}"`
 */
export function assessmentEtag(row: { id: string; updatedAt: Date | string }): string {
  const ts = new Date(row.updatedAt).getTime();
  return `"${row.id}:${ts}"`;
}

export interface PublishFeasibilityCheckItem {
  bankId: string;
  count: number;
  tags: string[];
  questionType: string | null;
}

export interface PublishFeasibilityFixedItem {
  questionVersionId: string;
  points: string;
  position: number;
}

export interface PublishValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates assessment readiness before publishing.
 * Verifies time windows, pool sufficiency against bank question inventory, rubric totals.
 */
export function validateAssessmentPublishFeasibility(params: {
  config: Partial<AssessmentVersionConfig>;
  fixedQuestions: PublishFeasibilityFixedItem[];
  pools: PublishFeasibilityCheckItem[];
  availableBankQuestions?: Record<string, AuthorQuestion[]>; // bankId -> questions
}): PublishValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { config, fixedQuestions, pools, availableBankQuestions } = params;

  // 1. Content existence check
  const totalItems = fixedQuestions.length + pools.reduce((acc, p) => acc + p.count, 0);
  if (totalItems === 0) {
    errors.push('Assessment must contain at least one fixed question or random pool draw.');
  }

  // 2. Window validation
  if (config.availableFrom && config.availableUntil) {
    if (Date.parse(config.availableFrom) >= Date.parse(config.availableUntil)) {
      errors.push('Availability start date must be strictly before availability end date.');
    }
  }

  if (config.dueAt) {
    if (config.availableFrom && Date.parse(config.dueAt) <= Date.parse(config.availableFrom)) {
      errors.push('Due date must be after availability start date.');
    }
    if (config.availableUntil && Date.parse(config.dueAt) > Date.parse(config.availableUntil)) {
      errors.push('Due date cannot be after availability hard cutoff date.');
    }
  }

  // 3. Pool feasibility check
  if (pools.length > 0 && availableBankQuestions) {
    for (const pool of pools) {
      const bankQuestions = availableBankQuestions[pool.bankId] ?? [];
      const eligible = bankQuestions.filter((q) => {
        if (q.archivedAt) return false;
        if (pool.questionType && q.latestVersion.payload.type !== pool.questionType) return false;
        if (pool.tags.length > 0) {
          const hasMatchingTag = pool.tags.some((t) => q.tags.includes(t));
          if (!hasMatchingTag) return false;
        }
        return true;
      });

      if (eligible.length < pool.count) {
        errors.push(
          `Pool requests ${pool.count} question(s) but only ${eligible.length} eligible question(s) match in bank ${pool.bankId.slice(0, 8)}...`,
        );
      } else if (eligible.length === pool.count) {
        warnings.push(
          `Pool draw count (${pool.count}) equals exact available questions; random pool will have zero variety.`,
        );
      }
    }
  }

  // 4. Rubric checks
  if (config.rubric && config.rubric.criteria) {
    if (config.rubric.criteria.length === 0) {
      errors.push('Rubric is enabled but contains no evaluation criteria.');
    } else {
      for (const [idx, c] of config.rubric.criteria.entries()) {
        if (!c.label.trim()) {
          errors.push(`Rubric criterion #${idx + 1} is missing a title.`);
        }
        if (parseFloat(c.maxPoints) <= 0) {
          errors.push(`Rubric criterion "${c.label || idx + 1}" must have positive max points.`);
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
