import { AlertCircle } from 'lucide-react';
import { parseAuthError } from '../api';

export interface AuthErrorBannerProps {
  error: unknown;
}

export function AuthErrorBanner({ error }: AuthErrorBannerProps) {
  if (!error) return null;
  const parsed = parseAuthError(error);

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-foreground"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-destructive">{parsed.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-foreground/90">{parsed.message}</p>

          {parsed.fieldIssues.length > 0 && (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-foreground/85">
              {parsed.fieldIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}

          {parsed.requestId && (
            <p className="mt-2 font-mono text-[10px] text-muted-foreground">
              Request ID: {parsed.requestId}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
