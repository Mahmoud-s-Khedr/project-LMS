'use client';

import * as React from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { textToRichText, richTextToText, formatPoints } from '../utils';
import {
  QuestionType,
  type AuthorQuestion,
  type AuthorQuestionPayload,
  type QuestionCreate,
} from '../types';
import {
  useCreateQuestionMutation,
  useUpdateQuestionMetadataMutation,
  useCreateQuestionVersionMutation,
} from '../hooks';
import { ApiError } from '@/lib/api';

interface QuestionEditorProps {
  workspaceId: string;
  bankId: string;
  question?: AuthorQuestion | null;
  onSuccess: () => void;
  onCancel: () => void;
}

interface OptionItem {
  key: string;
  text: string;
  group?: 'LEFT' | 'RIGHT';
}

export function QuestionEditor({
  workspaceId,
  bankId,
  question,
  onSuccess,
  onCancel,
}: QuestionEditorProps) {
  // Basic metadata
  const [title, setTitle] = React.useState(question?.title ?? '');
  const [tags, setTags] = React.useState<string[]>(question?.tags ?? []);
  const [tagInput, setTagInput] = React.useState('');
  const [defaultPoints, setDefaultPoints] = React.useState(
    question?.latestVersion.payload.defaultPoints ?? '1.000',
  );
  const [type, setType] = React.useState<string>(
    question?.latestVersion.payload.type ?? QuestionType.SINGLE_CHOICE,
  );
  const [promptText, setPromptText] = React.useState(
    richTextToText(question?.latestVersion.payload.prompt) || '',
  );
  const [explanationText, setExplanationText] = React.useState(
    richTextToText(question?.latestVersion.payload.explanation) || '',
  );

  // Type specific state
  // Choices (Single / Multiple)
  const [options, setOptions] = React.useState<OptionItem[]>(() => {
    if (
      question?.latestVersion.payload.options &&
      question.latestVersion.payload.options.length > 0
    ) {
      return question.latestVersion.payload.options.map((opt) => ({
        key: opt.key,
        text: richTextToText(opt.content) || opt.key,
        group: opt.group,
      }));
    }
    return [
      { key: 'opt-1', text: 'Option A' },
      { key: 'opt-2', text: 'Option B' },
      { key: 'opt-3', text: 'Option C' },
    ];
  });

  const [singleChoiceCorrectKey, setSingleChoiceCorrectKey] = React.useState<string>(() => {
    if (question?.latestVersion.payload.type === 'SINGLE_CHOICE') {
      return question.latestVersion.payload.answerKey.correctOptionKeys[0] ?? 'opt-1';
    }
    return 'opt-1';
  });

  const [multipleChoiceCorrectKeys, setMultipleChoiceCorrectKeys] = React.useState<Set<string>>(
    () => {
      if (question?.latestVersion.payload.type === 'MULTIPLE_CHOICE') {
        return new Set(question.latestVersion.payload.answerKey.correctOptionKeys);
      }
      return new Set(['opt-1']);
    },
  );

  const [partialCredit, setPartialCredit] = React.useState<boolean>(() => {
    if (
      question?.latestVersion.payload.type === 'MULTIPLE_CHOICE' ||
      question?.latestVersion.payload.type === 'MATCHING'
    ) {
      return Boolean(question.latestVersion.payload.gradingConfig.partialCredit);
    }
    return false;
  });

  // True / False
  const [tfValue, setTfValue] = React.useState<boolean>(() => {
    if (question?.latestVersion.payload.type === 'TRUE_FALSE') {
      return question.latestVersion.payload.answerKey.value;
    }
    return true;
  });

  // Short Answer
  const [acceptedAnswers, setAcceptedAnswers] = React.useState<string[]>(() => {
    if (question?.latestVersion.payload.type === 'SHORT_ANSWER') {
      return question.latestVersion.payload.answerKey.accepted;
    }
    return ['Exact answer'];
  });
  const [newAnswerInput, setNewAnswerInput] = React.useState('');
  const [caseSensitive, setCaseSensitive] = React.useState(false);
  const [trimWhitespace, setTrimWhitespace] = React.useState(true);
  const [collapseWhitespace, setCollapseWhitespace] = React.useState(true);

  // Numeric
  const [numericValue, setNumericValue] = React.useState<string>(() => {
    if (question?.latestVersion.payload.type === 'NUMERIC') {
      return question.latestVersion.payload.answerKey.value;
    }
    return '42.0';
  });
  const [numericTolerance, setNumericTolerance] = React.useState<string>(() => {
    if (question?.latestVersion.payload.type === 'NUMERIC') {
      return question.latestVersion.payload.answerKey.absoluteTolerance;
    }
    return '0.05';
  });

  // Matching
  const [matchingPairs] = React.useState<Array<{ leftKey: string; rightKey: string }>>(() => {
    if (question?.latestVersion.payload.type === 'MATCHING') {
      return question.latestVersion.payload.answerKey.pairs;
    }
    return [
      { leftKey: 'left-1', rightKey: 'right-1' },
      { leftKey: 'left-2', rightKey: 'right-2' },
    ];
  });

  const [matchingLeftOptions, setMatchingLeftOptions] = React.useState<OptionItem[]>(() => {
    if (question?.latestVersion.payload.type === 'MATCHING') {
      return question.latestVersion.payload.options
        .filter((o) => o.group === 'LEFT')
        .map((o) => ({ key: o.key, text: richTextToText(o.content) || o.key, group: 'LEFT' }));
    }
    return [
      { key: 'left-1', text: 'Item 1', group: 'LEFT' },
      { key: 'left-2', text: 'Item 2', group: 'LEFT' },
    ];
  });

  const [matchingRightOptions, setMatchingRightOptions] = React.useState<OptionItem[]>(() => {
    if (question?.latestVersion.payload.type === 'MATCHING') {
      return question.latestVersion.payload.options
        .filter((o) => o.group === 'RIGHT')
        .map((o) => ({ key: o.key, text: richTextToText(o.content) || o.key, group: 'RIGHT' }));
    }
    return [
      { key: 'right-1', text: 'Match A', group: 'RIGHT' },
      { key: 'right-2', text: 'Match B', group: 'RIGHT' },
    ];
  });

  // Ordering
  const [orderingOptions, setOrderingOptions] = React.useState<OptionItem[]>(() => {
    if (question?.latestVersion.payload.type === 'ORDERING') {
      return question.latestVersion.payload.options.map((o) => ({
        key: o.key,
        text: richTextToText(o.content) || o.key,
      }));
    }
    return [
      { key: 'ord-1', text: 'First Step' },
      { key: 'ord-2', text: 'Second Step' },
      { key: 'ord-3', text: 'Third Step' },
    ];
  });

  const [error, setError] = React.useState<string | null>(null);

  const createMutation = useCreateQuestionMutation(workspaceId, bankId);
  const updateMetaMutation = useUpdateQuestionMetadataMutation(workspaceId, question?.id ?? '');
  const createVersionMutation = useCreateQuestionVersionMutation(workspaceId, question?.id ?? '');

  const isPending =
    createMutation.isPending || updateMetaMutation.isPending || createVersionMutation.isPending;

  // Tag management
  const handleAddTag = () => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  // Choice options helpers
  const handleAddOption = () => {
    const nextKey = `opt-${Date.now().toString(36)}`;
    setOptions([...options, { key: nextKey, text: `Option ${options.length + 1}` }]);
  };

  const handleUpdateOptionText = (key: string, newText: string) => {
    setOptions(options.map((o) => (o.key === key ? { ...o, text: newText } : o)));
  };

  const handleRemoveOption = (key: string) => {
    if (options.length <= 2) {
      setError('A multiple/single choice question must have at least 2 options.');
      return;
    }
    setOptions(options.filter((o) => o.key !== key));
    if (singleChoiceCorrectKey === key) {
      const remaining = options.filter((o) => o.key !== key);
      setSingleChoiceCorrectKey(remaining[0]?.key ?? '');
    }
    const nextMC = new Set(multipleChoiceCorrectKeys);
    nextMC.delete(key);
    setMultipleChoiceCorrectKeys(nextMC);
  };

  // Build Discriminated Payload
  const buildPayload = (): AuthorQuestionPayload => {
    const promptDoc = textToRichText(promptText);
    const explanationDoc = explanationText.trim() ? textToRichText(explanationText) : null;
    const formattedPts = formatPoints(defaultPoints);

    switch (type) {
      case QuestionType.SINGLE_CHOICE: {
        const payloadOptions = options.map((opt, idx) => ({
          key: opt.key,
          content: textToRichText(opt.text),
          position: idx,
        }));
        return {
          type: 'SINGLE_CHOICE',
          prompt: promptDoc,
          explanation: explanationDoc,
          defaultPoints: formattedPts,
          options: payloadOptions,
          answerKey: { correctOptionKeys: [singleChoiceCorrectKey] },
          gradingConfig: {},
        };
      }
      case QuestionType.MULTIPLE_CHOICE: {
        const payloadOptions = options.map((opt, idx) => ({
          key: opt.key,
          content: textToRichText(opt.text),
          position: idx,
        }));
        return {
          type: 'MULTIPLE_CHOICE',
          prompt: promptDoc,
          explanation: explanationDoc,
          defaultPoints: formattedPts,
          options: payloadOptions,
          answerKey: { correctOptionKeys: Array.from(multipleChoiceCorrectKeys) },
          gradingConfig: { partialCredit },
        };
      }
      case QuestionType.TRUE_FALSE: {
        return {
          type: 'TRUE_FALSE',
          prompt: promptDoc,
          explanation: explanationDoc,
          defaultPoints: formattedPts,
          options: [],
          answerKey: { value: tfValue },
          gradingConfig: {},
        };
      }
      case QuestionType.SHORT_ANSWER: {
        return {
          type: 'SHORT_ANSWER',
          prompt: promptDoc,
          explanation: explanationDoc,
          defaultPoints: formattedPts,
          options: [],
          answerKey: { accepted: acceptedAnswers },
          gradingConfig: {
            caseSensitive,
            trim: trimWhitespace,
            collapseWhitespace,
          },
        };
      }
      case QuestionType.NUMERIC: {
        return {
          type: 'NUMERIC',
          prompt: promptDoc,
          explanation: explanationDoc,
          defaultPoints: formattedPts,
          options: [],
          answerKey: {
            value: numericValue,
            absoluteTolerance: numericTolerance,
          },
          gradingConfig: {},
        };
      }
      case QuestionType.ESSAY: {
        return {
          type: 'ESSAY',
          prompt: promptDoc,
          explanation: explanationDoc,
          defaultPoints: formattedPts,
          options: [],
          answerKey: {},
          gradingConfig: {},
        };
      }
      case QuestionType.FILE_UPLOAD: {
        return {
          type: 'FILE_UPLOAD',
          prompt: promptDoc,
          explanation: explanationDoc,
          defaultPoints: formattedPts,
          options: [],
          answerKey: {},
          gradingConfig: {},
        };
      }
      case QuestionType.MATCHING: {
        const left = matchingLeftOptions.map((o, idx) => ({
          key: o.key,
          content: textToRichText(o.text),
          position: idx,
          group: 'LEFT' as const,
        }));
        const right = matchingRightOptions.map((o, idx) => ({
          key: o.key,
          content: textToRichText(o.text),
          position: left.length + idx,
          group: 'RIGHT' as const,
        }));
        return {
          type: 'MATCHING',
          prompt: promptDoc,
          explanation: explanationDoc,
          defaultPoints: formattedPts,
          options: [...left, ...right],
          answerKey: { pairs: matchingPairs },
          gradingConfig: { partialCredit },
        };
      }
      case QuestionType.ORDERING: {
        const payloadOptions = orderingOptions.map((opt, idx) => ({
          key: opt.key,
          content: textToRichText(opt.text),
          position: idx,
        }));
        return {
          type: 'ORDERING',
          prompt: promptDoc,
          explanation: explanationDoc,
          defaultPoints: formattedPts,
          options: payloadOptions,
          answerKey: { optionKeys: orderingOptions.map((o) => o.key) },
          gradingConfig: {},
        };
      }
      default:
        throw new Error(`Unsupported question type: ${type}`);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError('Question title is required.');
      return;
    }
    if (!promptText.trim()) {
      setError('Question prompt is required.');
      return;
    }

    // Specific validation
    if (type === QuestionType.SINGLE_CHOICE && !singleChoiceCorrectKey) {
      setError('Please select the correct option.');
      return;
    }
    if (type === QuestionType.MULTIPLE_CHOICE && multipleChoiceCorrectKeys.size === 0) {
      setError('Please select at least one correct option.');
      return;
    }
    if (type === QuestionType.SHORT_ANSWER && acceptedAnswers.length === 0) {
      setError('Please provide at least one accepted answer.');
      return;
    }

    try {
      const payload = buildPayload();

      if (question) {
        // Update question metadata with If-Match precondition
        await updateMetaMutation.mutateAsync({
          input: {
            title: title.trim(),
            tags,
          },
          ifMatch: question,
        });
        // Create new immutable version
        await createVersionMutation.mutateAsync(payload);
      } else {
        const createInput: QuestionCreate = {
          title: title.trim(),
          tags,
          payload,
        };
        await createMutation.mutateAsync(createInput);
      }
      onSuccess();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setError(
          'This question was modified by another session. Please reload to see the latest version.',
        );
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to save question';
        setError(msg);
      }
    }
  };

  return (
    <Card className="max-w-4xl mx-auto border shadow-sm">
      <CardHeader>
        <CardTitle>
          {question ? `Edit Question: ${question.title}` : 'Author New Question'}
        </CardTitle>
        <CardDescription>
          {question
            ? 'Saving creates a new immutable question version. Previous versions remain frozen in historical attempts.'
            : 'Author reusable assessment questions with typed keys, options, and grading rules.'}
        </CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          {error && (
            <div
              role="alert"
              className="rounded-md bg-destructive/10 p-3 text-sm font-medium text-destructive"
            >
              {error}
            </div>
          )}

          {/* Top metadata grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="q-title">Question Title</Label>
              <Input
                id="q-title"
                placeholder="e.g. CAP Theorem Tradeoffs"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="q-type">Question Type</Label>
              <Select
                value={type}
                onValueChange={(val) => {
                  setType(val);
                  setError(null);
                }}
                disabled={Boolean(question)} // Preserve type across versions
              >
                <SelectTrigger id="q-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={QuestionType.SINGLE_CHOICE}>Single Choice (Radio)</SelectItem>
                  <SelectItem value={QuestionType.MULTIPLE_CHOICE}>
                    Multiple Choice (Checkbox)
                  </SelectItem>
                  <SelectItem value={QuestionType.TRUE_FALSE}>True / False</SelectItem>
                  <SelectItem value={QuestionType.SHORT_ANSWER}>Short Answer</SelectItem>
                  <SelectItem value={QuestionType.NUMERIC}>Numeric / Calculated</SelectItem>
                  <SelectItem value={QuestionType.ESSAY}>Essay / Long Form</SelectItem>
                  <SelectItem value={QuestionType.FILE_UPLOAD}>File Upload</SelectItem>
                  <SelectItem value={QuestionType.MATCHING}>Matching Pairs</SelectItem>
                  <SelectItem value={QuestionType.ORDERING}>Ordering / Sequence</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Points & Tags */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="q-points">Default Points</Label>
              <Input
                id="q-points"
                type="number"
                step="0.1"
                min="0.1"
                max="1000"
                value={defaultPoints}
                onChange={(e) => setDefaultPoints(e.target.value)}
                required
              />
            </div>

            <div className="md:col-span-2 space-y-1.5">
              <Label>Tags (Keywords for Pool Sampling)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. database, easy, networking"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                />
                <Button type="button" variant="outline" onClick={handleAddTag}>
                  Add Tag
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1 px-2 py-0.5 text-xs">
                    {t}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Question Prompt */}
          <div className="space-y-1.5">
            <Label htmlFor="q-prompt">Question Prompt</Label>
            <Textarea
              id="q-prompt"
              rows={4}
              placeholder="State the problem clearly. Learners will see this prompt during testing..."
              value={promptText}
              onChange={(e) => setPromptText(e.target.value)}
              required
            />
          </div>

          {/* TYPE-SPECIFIC CONFIGURATIONS */}

          {/* 1. SINGLE CHOICE */}
          {type === QuestionType.SINGLE_CHOICE && (
            <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Answer Options</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddOption}
                  className="gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Option
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Select the radio button next to the correct answer.
              </p>
              <div className="space-y-2">
                {options.map((opt) => (
                  <div key={opt.key} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="single-choice-answer"
                      id={`radio-${opt.key}`}
                      checked={singleChoiceCorrectKey === opt.key}
                      onChange={() => setSingleChoiceCorrectKey(opt.key)}
                      className="h-4 w-4 text-primary"
                    />
                    <Input
                      value={opt.text}
                      onChange={(e) => handleUpdateOptionText(opt.key, e.target.value)}
                      placeholder="Option text..."
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveOption(opt.key)}
                      disabled={options.length <= 2}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 2. MULTIPLE CHOICE */}
          {type === QuestionType.MULTIPLE_CHOICE && (
            <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">Answer Options (Multiple Correct)</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleAddOption}
                  className="gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Option
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Check all options that are correct. Students must select these.
              </p>
              <div className="space-y-2">
                {options.map((opt) => {
                  const isChecked = multipleChoiceCorrectKeys.has(opt.key);
                  return (
                    <div key={opt.key} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`check-${opt.key}`}
                        checked={isChecked}
                        onChange={() => {
                          const next = new Set(multipleChoiceCorrectKeys);
                          if (isChecked) next.delete(opt.key);
                          else next.add(opt.key);
                          setMultipleChoiceCorrectKeys(next);
                        }}
                        className="h-4 w-4 rounded text-primary"
                      />
                      <Input
                        value={opt.text}
                        onChange={(e) => handleUpdateOptionText(opt.key, e.target.value)}
                        placeholder="Option text..."
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveOption(opt.key)}
                        disabled={options.length <= 2}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  );
                })}
              </div>
              <div className="pt-2">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={partialCredit}
                    onChange={(e) => setPartialCredit(e.target.checked)}
                    className="h-4 w-4 rounded"
                  />
                  Allow Partial Credit (score proportional to correct selections)
                </label>
              </div>
            </div>
          )}

          {/* 3. TRUE / FALSE */}
          {type === QuestionType.TRUE_FALSE && (
            <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
              <Label className="text-sm font-semibold">Correct Statement Value</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="radio"
                    name="tf-val"
                    checked={tfValue === true}
                    onChange={() => setTfValue(true)}
                    className="h-4 w-4 text-primary"
                  />
                  True
                </label>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="radio"
                    name="tf-val"
                    checked={tfValue === false}
                    onChange={() => setTfValue(false)}
                    className="h-4 w-4 text-primary"
                  />
                  False
                </label>
              </div>
            </div>
          )}

          {/* 4. SHORT ANSWER */}
          {type === QuestionType.SHORT_ANSWER && (
            <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
              <Label className="text-sm font-semibold">Accepted Answers</Label>
              <p className="text-xs text-muted-foreground">
                Add one or more equivalent correct words or short phrases.
              </p>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. CPU, Central Processing Unit"
                  value={newAnswerInput}
                  onChange={(e) => setNewAnswerInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (newAnswerInput.trim()) {
                        setAcceptedAnswers([...acceptedAnswers, newAnswerInput.trim()]);
                        setNewAnswerInput('');
                      }
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (newAnswerInput.trim()) {
                      setAcceptedAnswers([...acceptedAnswers, newAnswerInput.trim()]);
                      setNewAnswerInput('');
                    }
                  }}
                >
                  Add Answer
                </Button>
              </div>
              <div className="space-y-1.5 pt-1">
                {acceptedAnswers.map((ans, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between rounded border bg-background px-3 py-1.5 text-sm"
                  >
                    <span>{ans}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setAcceptedAnswers(acceptedAnswers.filter((_, i) => i !== idx))
                      }
                      disabled={acceptedAnswers.length <= 1}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
              <div className="space-y-2 pt-2 border-t text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={caseSensitive}
                    onChange={(e) => setCaseSensitive(e.target.checked)}
                    className="h-4 w-4 rounded"
                  />
                  Case-sensitive matching
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={trimWhitespace}
                    onChange={(e) => setTrimWhitespace(e.target.checked)}
                    className="h-4 w-4 rounded"
                  />
                  Trim leading and trailing whitespace
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={collapseWhitespace}
                    onChange={(e) => setCollapseWhitespace(e.target.checked)}
                    className="h-4 w-4 rounded"
                  />
                  Collapse repeated internal whitespace
                </label>
              </div>
            </div>
          )}

          {/* 5. NUMERIC */}
          {type === QuestionType.NUMERIC && (
            <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
              <Label className="text-sm font-semibold">Numeric Answer & Tolerance</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="num-val">Expected Value</Label>
                  <Input
                    id="num-val"
                    placeholder="e.g. 3.1415"
                    value={numericValue}
                    onChange={(e) => setNumericValue(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="num-tol">Absolute Tolerance (±)</Label>
                  <Input
                    id="num-tol"
                    placeholder="e.g. 0.01"
                    value={numericTolerance}
                    onChange={(e) => setNumericTolerance(e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>
          )}

          {/* 6. ESSAY */}
          {type === QuestionType.ESSAY && (
            <div className="rounded-lg border p-4 bg-muted/20">
              <Label className="text-sm font-semibold">Essay / Free Text Submission</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Students will compose responses in rich text format. This question requires manual
                instructor grading via rubric or points.
              </p>
            </div>
          )}

          {/* 7. FILE UPLOAD */}
          {type === QuestionType.FILE_UPLOAD && (
            <div className="rounded-lg border p-4 bg-muted/20">
              <Label className="text-sm font-semibold">File Upload Submission</Label>
              <p className="text-xs text-muted-foreground mt-1">
                Students upload attachments (PDF, source code, ZIP, etc.) per assessment delivery
                constraints. Submissions are reviewed in the manual grading queue.
              </p>
            </div>
          )}

          {/* 8. MATCHING */}
          {type === QuestionType.MATCHING && (
            <div className="space-y-4 rounded-lg border p-4 bg-muted/20">
              <Label className="text-sm font-semibold">Matching Pairs</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Left side */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Left Prompts</Label>
                  {matchingLeftOptions.map((opt, i) => (
                    <Input
                      key={opt.key}
                      value={opt.text}
                      onChange={(e) => {
                        const next = [...matchingLeftOptions];
                        next[i] = { ...opt, text: e.target.value };
                        setMatchingLeftOptions(next);
                      }}
                      placeholder={`Left Item ${i + 1}`}
                    />
                  ))}
                </div>
                {/* Right side */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Matching Targets</Label>
                  {matchingRightOptions.map((opt, i) => (
                    <Input
                      key={opt.key}
                      value={opt.text}
                      onChange={(e) => {
                        const next = [...matchingRightOptions];
                        next[i] = { ...opt, text: e.target.value };
                        setMatchingRightOptions(next);
                      }}
                      placeholder={`Right Target ${i + 1}`}
                    />
                  ))}
                </div>
              </div>
              <div className="pt-2">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={partialCredit}
                    onChange={(e) => setPartialCredit(e.target.checked)}
                    className="h-4 w-4 rounded"
                  />
                  Allow Partial Credit for each correct pair
                </label>
              </div>
            </div>
          )}

          {/* 9. ORDERING */}
          {type === QuestionType.ORDERING && (
            <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold">
                  Sequence Items in Correct Target Order
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setOrderingOptions([
                      ...orderingOptions,
                      {
                        key: `ord-${Date.now().toString(36)}`,
                        text: `Step ${orderingOptions.length + 1}`,
                      },
                    ])
                  }
                  className="gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Step
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Learners will be presented with these items shuffled and must arrange them into this
                exact order.
              </p>
              <div className="space-y-2">
                {orderingOptions.map((opt, idx) => (
                  <div key={opt.key} className="flex items-center gap-2">
                    <span className="w-6 text-center text-xs font-bold text-muted-foreground">
                      {idx + 1}.
                    </span>
                    <Input
                      value={opt.text}
                      onChange={(e) => {
                        const next = [...orderingOptions];
                        next[idx] = { ...opt, text: e.target.value };
                        setOrderingOptions(next);
                      }}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={idx === 0}
                      onClick={() => {
                        const next = [...orderingOptions];
                        const temp = next[idx - 1]!;
                        next[idx - 1] = next[idx]!;
                        next[idx] = temp;
                        setOrderingOptions(next);
                      }}
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={idx === orderingOptions.length - 1}
                      onClick={() => {
                        const next = [...orderingOptions];
                        const temp = next[idx + 1]!;
                        next[idx + 1] = next[idx]!;
                        next[idx] = temp;
                        setOrderingOptions(next);
                      }}
                    >
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={orderingOptions.length <= 2}
                      onClick={() =>
                        setOrderingOptions(orderingOptions.filter((o) => o.key !== opt.key))
                      }
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Explanation / Solution Note */}
          <div className="space-y-1.5">
            <Label htmlFor="q-explanation">
              Explanation & Solution Notes{' '}
              <span className="text-xs text-muted-foreground">(Optional)</span>
            </Label>
            <Textarea
              id="q-explanation"
              rows={2}
              placeholder="Provide solution rationale released per feedback policy..."
              value={explanationText}
              onChange={(e) => setExplanationText(e.target.value)}
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t">
            <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : question ? 'Save New Version' : 'Create Question'}
            </Button>
          </div>
        </CardContent>
      </form>
    </Card>
  );
}
