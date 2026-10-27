'use client';

import * as React from 'react';
import Link from 'next/link';
import { Search, Plus, FolderKanban, MoreVertical, Archive, Edit, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { QuestionBankDialog } from './question-bank-dialog';
import {
  useQuestionBanksQuery,
  useCreateQuestionBankMutation,
  useUpdateQuestionBankMutation,
  useArchiveQuestionBankMutation,
} from '../hooks';
import type { QuestionBank } from '@lms/shared';
import { ApiError } from '@/lib/api';

interface QuestionBanksListProps {
  workspaceId: string;
}

export function QuestionBanksList({ workspaceId }: QuestionBanksListProps) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingBank, setEditingBank] = React.useState<QuestionBank | null>(null);
  const [conflictError, setConflictError] = React.useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuestionBanksQuery(workspaceId, {
    search: searchTerm || undefined,
  });

  const createMutation = useCreateQuestionBankMutation(workspaceId);
  const updateMutation = useUpdateQuestionBankMutation(workspaceId);
  const archiveMutation = useArchiveQuestionBankMutation(workspaceId);

  const banks = data?.data ?? [];

  const handleCreateOrUpdate = async (input: { name: string; description: string | null }) => {
    try {
      setConflictError(null);
      if (editingBank) {
        await updateMutation.mutateAsync({
          bankId: editingBank.id,
          input: { name: input.name, description: input.description },
          ifMatch: editingBank,
        });
      } else {
        await createMutation.mutateAsync(input);
      }
      setDialogOpen(false);
      setEditingBank(null);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 409) {
        setConflictError(
          'This question bank was modified by another session. Please reload to see the latest changes.',
        );
        void refetch();
      } else {
        alert(err instanceof Error ? err.message : 'Operation failed');
      }
    }
  };

  const handleArchive = async (bank: QuestionBank) => {
    if (window.confirm(`Are you sure you want to archive "${bank.name}"?`)) {
      try {
        setConflictError(null);
        await archiveMutation.mutateAsync({
          bankId: bank.id,
          ifMatch: bank,
        });
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 409) {
          setConflictError(
            'This question bank was modified by another session. Please reload to see the latest changes.',
          );
          void refetch();
        } else {
          alert(err instanceof Error ? err.message : 'Archive failed');
        }
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Top action header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Question Banks</h1>
          <p className="text-sm text-muted-foreground">
            Author and organize reusable questions, tests, and pools across courses.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingBank(null);
            setDialogOpen(true);
          }}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Create Question Bank
        </Button>
      </div>

      {conflictError && (
        <div
          role="alert"
          className="rounded-lg border border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-center justify-between"
        >
          <span>{conflictError}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void refetch()}
            className="h-7 text-xs"
          >
            Reload Now
          </Button>
        </div>
      )}

      {/* Search Filter */}
      <div className="flex items-center gap-2 max-w-sm">
        <div className="relative w-full">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search banks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {/* Content states */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="animate-pulse p-6">
              <Skeleton className="h-6 w-3/4 mb-2" />
              <Skeleton className="h-4 w-full mb-4" />
              <Skeleton className="h-8 w-24" />
            </Card>
          ))}
        </div>
      ) : error ? (
        <Card className="p-8 text-center border-destructive/20 bg-destructive/5">
          <h3 className="font-semibold text-destructive">Failed to load question banks</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {error instanceof Error ? error.message : 'An error occurred'}
          </p>
        </Card>
      ) : banks.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <FolderKanban className="mx-auto h-12 w-12 text-muted-foreground/60 mb-3" />
          <h3 className="text-lg font-semibold">No Question Banks Found</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto mt-1 mb-4">
            {searchTerm
              ? `No banks matching "${searchTerm}". Try a different keyword.`
              : 'Create your first question bank to start authoring reusable assessment questions.'}
          </p>
          <Button
            onClick={() => {
              setEditingBank(null);
              setDialogOpen(true);
            }}
            variant="outline"
          >
            Create Question Bank
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {banks.map((bank) => (
            <Card
              key={bank.id}
              className="flex flex-col justify-between hover:shadow-md transition-shadow"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <CardTitle className="text-base line-clamp-1">{bank.name}</CardTitle>
                    <CardDescription className="line-clamp-2 text-xs">
                      {bank.description || 'No description provided.'}
                    </CardDescription>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                        <span className="sr-only">Actions</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingBank(bank);
                          setDialogOpen(true);
                        }}
                      >
                        <Edit className="mr-2 h-4 w-4" />
                        Edit Details
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleArchive(bank)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Archive className="mr-2 h-4 w-4" />
                        Archive Bank
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>

              <CardContent className="pt-0">
                <div className="flex items-center justify-between border-t pt-3 mt-2 text-xs text-muted-foreground">
                  <span>Created {new Date(bank.createdAt).toLocaleDateString()}</span>
                  <Link
                    href={`/instructor/question-banks/${bank.id}`}
                    className="inline-flex items-center font-medium text-primary hover:underline gap-1"
                  >
                    Manage Questions
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <QuestionBankDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        bank={editingBank}
        onSubmit={handleCreateOrUpdate}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
