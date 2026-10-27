'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, FolderKanban } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useActiveWorkspace } from '@/features/workspaces';
import {
  QuestionsTable,
  QuestionEditor,
  useQuestionBanksQuery,
} from '@/features/assessment-authoring';
import type { AuthorQuestion } from '@lms/shared';

interface BankQuestionsPageProps {
  params: Promise<{ bankId: string }>;
}

export default function BankQuestionsPage({ params }: BankQuestionsPageProps) {
  const resolvedParams = React.use(params);
  const { bankId } = resolvedParams;

  const { activeWorkspaceId, isLoading: loadingWorkspace } = useActiveWorkspace();

  // Mode: 'table' | 'editor'
  const [mode, setMode] = React.useState<'table' | 'editor'>('table');
  const [editingQuestion, setEditingQuestion] = React.useState<AuthorQuestion | null>(null);

  // Load bank info
  const { data: banksData } = useQuestionBanksQuery(
    activeWorkspaceId ?? '',
    {},
    { enabled: Boolean(activeWorkspaceId) },
  );
  const currentBank = banksData?.data.find((b) => b.id === bankId);

  if (loadingWorkspace || !activeWorkspaceId) {
    return (
      <div className="space-y-4 max-w-6xl mx-auto p-4 sm:p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6">
      {/* Top Breadcrumb */}
      <div className="flex items-center justify-between">
        <Link
          href="/instructor/question-banks"
          className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Question Banks
        </Link>
      </div>

      {mode === 'table' ? (
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5 text-primary" />
              <h1 className="text-2xl font-bold tracking-tight">
                {currentBank?.name || 'Question Bank'}
              </h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              {currentBank?.description ||
                'Author questions with typed keys and explanations. Questions are versioned on edit.'}
            </p>
          </div>

          <QuestionsTable
            workspaceId={activeWorkspaceId}
            bankId={bankId}
            onAddQuestion={() => {
              setEditingQuestion(null);
              setMode('editor');
            }}
            onEditQuestion={(q) => {
              setEditingQuestion(q);
              setMode('editor');
            }}
          />
        </div>
      ) : (
        <QuestionEditor
          workspaceId={activeWorkspaceId}
          bankId={bankId}
          question={editingQuestion}
          onSuccess={() => {
            setMode('table');
            setEditingQuestion(null);
          }}
          onCancel={() => {
            setMode('table');
            setEditingQuestion(null);
          }}
        />
      )}
    </div>
  );
}
