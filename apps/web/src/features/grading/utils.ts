import type { GradeEvent, StaffAttempt } from '@lms/shared';

/**
 * Resolves a GradeEvent.answerId against the attempt detail questions projection.
 *
 * In newly submitted attempts, AttemptAnswer.id matches AttemptQuestion.id.
 * In legacy/seeded attempts, AttemptAnswer.id may differ from AttemptQuestion.id.
 * This resolver:
 * 1. Checks direct match against delivery.attemptQuestionId or answer.attemptQuestionId.
 * 2. Checks if an answer object contains a matching id.
 * 3. Falls back to attempt question matching for single question or single manual question attempts.
 */
export function resolveGradeEventQuestion(
  event: GradeEvent,
  questions?: StaffAttempt['questions'],
): StaffAttempt['questions'][number] | undefined {
  if (!questions || questions.length === 0 || !event.answerId) return undefined;

  // 1. Direct match with attemptQuestionId (delivery or answer)
  const direct = questions.find(
    (q) =>
      q.delivery.attemptQuestionId === event.answerId ||
      q.answer?.attemptQuestionId === event.answerId,
  );
  if (direct) return direct;

  // 2. Check if answer matches legacy answerId or answer object id if present
  const byAnswerId = questions.find(
    (q) => (q.answer as unknown as { id?: string })?.id === event.answerId,
  );
  if (byAnswerId) return byAnswerId;

  // 3. Fallback for single question attempt
  if (questions.length === 1) return questions[0];

  // 4. Fallback for single manual grading question (essay / file upload)
  const manual = questions.filter(
    (q) => q.delivery.type === 'ESSAY' || q.delivery.type === 'FILE_UPLOAD',
  );
  if (manual.length === 1) return manual[0];

  // 5. Fallback for single answered question
  const answered = questions.filter((q) => q.answer !== null);
  if (answered.length === 1) return answered[0];

  return undefined;
}
