'use client';

import React, { useState } from 'react';
import { Upload, FileText, Trash2, Download, AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { uploadAttemptAttachment, downloadAttemptAttachment } from '../../api';
import type { LearnerQuestion, QuestionResponse } from '../../types';

interface FileUploadQuestionProps {
  question: LearnerQuestion;
  attemptId: string;
  workspaceId: string;
  value?: Extract<QuestionResponse, { type: 'FILE_UPLOAD' }> | null;
  attachmentIds?: string[];
  onChange: (
    val: Extract<QuestionResponse, { type: 'FILE_UPLOAD' }>,
    attachmentIds: string[],
  ) => void;
  allowedFileTypes?: string[];
  maxUploadBytes?: string;
  maxFiles?: number;
  disabled?: boolean;
}

export function FileUploadQuestion({
  question,
  attemptId,
  workspaceId,
  value,
  attachmentIds = [],
  onChange,
  allowedFileTypes = ['application/pdf', 'text/plain', 'image/jpeg', 'image/png'],
  maxUploadBytes = '10485760',
  maxFiles = 5,
  disabled = false,
}: FileUploadQuestionProps) {
  const [note, setNote] = useState(value?.note ?? '');
  const [attachments, setAttachments] = useState<Array<{ id: string; name: string }>>(() =>
    attachmentIds.map((id) => ({ id, name: `Attachment ${id.slice(0, 8)}` })),
  );
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextNote = e.target.value;
    setNote(nextNote);
    onChange(
      { type: 'FILE_UPLOAD', note: nextNote },
      attachments.map((a) => a.id),
    );
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (attachments.length >= maxFiles) {
      setUploadError(`Maximum of ${maxFiles} files reached.`);
      return;
    }

    if (file.size > parseInt(maxUploadBytes, 10)) {
      setUploadError(
        `File exceeds maximum size of ${(parseInt(maxUploadBytes, 10) / (1024 * 1024)).toFixed(0)} MB.`,
      );
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const uploaded = await uploadAttemptAttachment(workspaceId, attemptId, file);
      const nextList = [...attachments, { id: uploaded.assetId, name: uploaded.filename }];
      setAttachments(nextList);
      onChange(
        { type: 'FILE_UPLOAD', note },
        nextList.map((a) => a.id),
      );
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const handleRemove = (assetId: string) => {
    const nextList = attachments.filter((a) => a.id !== assetId);
    setAttachments(nextList);
    onChange(
      { type: 'FILE_UPLOAD', note },
      nextList.map((a) => a.id),
    );
  };

  const handleDownload = async (assetId: string, filename: string) => {
    try {
      const cap = await downloadAttemptAttachment(attemptId, assetId);
      const link = document.createElement('a');
      link.href = cap.url;
      link.download = filename;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Failed to download submission attachment:', err);
    }
  };

  return (
    <div className="space-y-4" data-testid="file-upload-question">
      {/* Upload Dropzone */}
      <div className="rounded-xl border border-dashed p-6 text-center bg-card">
        <Upload className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
        <h4 className="text-xs font-semibold text-foreground">Upload Submission File</h4>
        <p className="text-[11px] text-muted-foreground mt-1">
          Accepted formats: {allowedFileTypes.join(', ')} (Max{' '}
          {(parseInt(maxUploadBytes, 10) / (1024 * 1024)).toFixed(0)} MB)
        </p>

        <label className="mt-4 inline-block">
          <input
            type="file"
            onChange={handleFileSelect}
            disabled={disabled || isUploading || attachments.length >= maxFiles}
            accept={allowedFileTypes.join(',')}
            className="sr-only"
            data-testid="file-upload-input"
          />
          <span
            className="inline-flex cursor-pointer items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50"
            role="button"
            tabIndex={0}
          >
            {isUploading ? (
              <>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                <span>Uploading & scanning...</span>
              </>
            ) : (
              <span>Select File</span>
            )}
          </span>
        </label>
      </div>

      {uploadError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{uploadError}</span>
        </div>
      )}

      {/* Uploaded Files List */}
      {attachments.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Uploaded Files ({attachments.length} / {maxFiles})
          </h5>
          <ul className="space-y-1.5">
            {attachments.map((file) => (
              <li
                key={file.id}
                className="flex items-center justify-between rounded-lg border bg-muted/20 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0 mr-2">
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate font-medium text-foreground">{file.name}</span>
                  <Badge variant="outline" className="text-[9px] px-1 py-0 text-emerald-600">
                    Ready
                  </Badge>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => void handleDownload(file.id, file.name)}
                    aria-label={`Download ${file.name}`}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  {!disabled && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={() => handleRemove(file.id)}
                      aria-label={`Remove ${file.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Submission notes */}
      <div className="space-y-1.5">
        <label
          htmlFor={`note-${question.attemptQuestionId}`}
          className="text-xs font-medium text-muted-foreground"
        >
          Submission notes (optional):
        </label>
        <Textarea
          id={`note-${question.attemptQuestionId}`}
          value={note}
          onChange={handleNoteChange}
          disabled={disabled}
          placeholder="Add any notes or explanations regarding your file submission..."
          rows={3}
          className="text-xs"
          data-testid="file-upload-note-input"
        />
      </div>
    </div>
  );
}
