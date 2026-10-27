import { describe, it, expect, vi, beforeEach } from 'vitest';
import { api } from '@/lib/api';
import {
  fetchQuestionBanks,
  createQuestionBank,
  updateQuestionBank,
  archiveQuestionBank,
  fetchQuestionsInBank,
  fetchQuestionDetail,
  createQuestionInBank,
  updateQuestionMetadata,
  archiveQuestion,
  createQuestionVersion,
  fetchQuestionVersions,
  createAssessment,
  fetchAssessmentDetail,
  fetchAssessmentVersions,
  fetchSelectedQuestions,
  fetchSelectedPools,
  createAssessmentVersion,
  updateAssessmentVersion,
  replaceAssessmentQuestions,
  replaceAssessmentPools,
  publishAssessmentVersion,
  upsertAccommodation,
} from './api';
import { assessmentEtag, textToRichText } from './utils';

const IDS = {
  workspace: '10000000-0000-4000-8000-000000000001',
  course: '10000000-0000-4000-8000-000000000002',
  lesson: '10000000-0000-4000-8000-000000000003',
  bank: '10000000-0000-4000-8000-000000000004',
  question: '10000000-0000-4000-8000-000000000005',
  questionVersion: '10000000-0000-4000-8000-000000000006',
  assessment: '10000000-0000-4000-8000-000000000007',
  assessmentVersion: '10000000-0000-4000-8000-000000000008',
  enrollment: '10000000-0000-4000-8000-000000000009',
};

const mockQuestionVersionPayload = {
  type: 'ESSAY' as const,
  prompt: textToRichText('Explain distributed consensus.'),
  explanation: null,
  defaultPoints: '10.000',
  options: [],
  answerKey: {},
  gradingConfig: {},
};

const mockAuthorQuestion = {
  id: IDS.question,
  workspaceId: IDS.workspace,
  bankId: IDS.bank,
  createdById: IDS.workspace,
  title: 'Consensus Question',
  tags: ['distributed'],
  archivedAt: null,
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
  latestVersion: {
    id: IDS.questionVersion,
    workspaceId: IDS.workspace,
    questionId: IDS.question,
    version: 1,
    createdAt: '2026-10-26T00:00:00.000Z',
    payload: mockQuestionVersionPayload,
  },
};

const mockAssessmentVersionData = {
  id: IDS.assessmentVersion,
  workspaceId: IDS.workspace,
  assessmentId: IDS.assessment,
  version: 1,
  status: 'DRAFT' as const,
  instructions: textToRichText('Complete all questions.'),
  maxAttempts: 3,
  timeLimitSeconds: 3600,
  availableFrom: null,
  dueAt: null,
  availableUntil: null,
  allowLateSubmission: false,
  latePenaltyPercent: '0.00',
  passPercent: '70.00',
  gradePolicy: 'HIGHEST' as const,
  feedbackPolicy: 'IMMEDIATE' as const,
  shuffleQuestions: true,
  shuffleOptions: true,
  rubric: null,
  allowedFileTypes: ['application/pdf' as const],
  maxUploadBytes: '10485760',
  maxFiles: 1,
  createdAt: '2026-10-26T00:00:00.000Z',
  updatedAt: '2026-10-26T00:00:00.000Z',
  publishedAt: null,
};

describe('Assessment Authoring API Client', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('ETag helper', () => {
    it('generates ETag matching backend domain format', () => {
      const etag = assessmentEtag({
        id: IDS.bank,
        updatedAt: '2026-10-26T12:00:00.000Z',
      });
      const ts = new Date('2026-10-26T12:00:00.000Z').getTime();
      expect(etag).toBe(`"${IDS.bank}:${ts}"`);
    });
  });

  describe('Question Banks API', () => {
    it('fetchQuestionBanks sends GET with query and parses response', async () => {
      const mockRaw = {
        data: [
          {
            id: IDS.bank,
            workspaceId: IDS.workspace,
            name: 'Algorithms Bank',
            description: 'Core questions',
            createdById: IDS.workspace,
            createdAt: '2026-10-26T00:00:00.000Z',
            updatedAt: '2026-10-26T00:00:00.000Z',
          },
        ],
        meta: { limit: 20, hasMore: false, nextCursor: null },
      };
      vi.spyOn(api, 'get').mockResolvedValueOnce(mockRaw);

      const res = await fetchQuestionBanks(IDS.workspace, { search: 'Algo' });
      expect(api.get).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/question-banks?search=Algo`,
      );
      expect(res.data).toHaveLength(1);
      expect(res.data[0]?.name).toBe('Algorithms Bank');
    });

    it('createQuestionBank sends POST and parses created bank', async () => {
      const bank = {
        id: IDS.bank,
        workspaceId: IDS.workspace,
        name: 'New Question Bank',
        description: 'Description',
        createdById: IDS.workspace,
        createdAt: '2026-10-26T00:00:00.000Z',
        updatedAt: '2026-10-26T00:00:00.000Z',
      };
      vi.spyOn(api, 'post').mockResolvedValueOnce({ data: bank });

      const res = await createQuestionBank(IDS.workspace, {
        name: 'New Question Bank',
        description: 'Description',
      });
      expect(api.post).toHaveBeenCalledWith(`/workspaces/${IDS.workspace}/question-banks`, {
        name: 'New Question Bank',
        description: 'Description',
      });
      expect(res.name).toBe('New Question Bank');
    });

    it('updateQuestionBank sends PATCH with If-Match header from entity', async () => {
      const bank = {
        id: IDS.bank,
        workspaceId: IDS.workspace,
        name: 'Algorithms Bank',
        description: 'Updated description',
        createdById: IDS.workspace,
        createdAt: '2026-10-26T00:00:00.000Z',
        updatedAt: '2026-10-26T01:00:00.000Z',
      };
      vi.spyOn(api, 'patch').mockResolvedValueOnce({ data: bank });

      const res = await updateQuestionBank(
        IDS.workspace,
        IDS.bank,
        { name: 'Algorithms Bank', description: 'Updated description' },
        bank,
      );

      const expectedEtag = assessmentEtag(bank);
      expect(api.patch).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/question-banks/${IDS.bank}`,
        { name: 'Algorithms Bank', description: 'Updated description' },
        { headers: { 'If-Match': expectedEtag } },
      );
      expect(res.description).toBe('Updated description');
    });

    it('archiveQuestionBank sends DELETE with If-Match header', async () => {
      const bank = {
        id: IDS.bank,
        updatedAt: '2026-10-26T01:00:00.000Z',
      };
      vi.spyOn(api, 'delete').mockResolvedValueOnce(undefined);

      await archiveQuestionBank(IDS.workspace, IDS.bank, bank);

      const expectedEtag = assessmentEtag(bank);
      expect(api.delete).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/question-banks/${IDS.bank}`,
        { headers: { 'If-Match': expectedEtag } },
      );
    });
  });

  describe('Questions API', () => {
    it('fetchQuestionsInBank sends GET with query and parses response', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({
        data: [mockAuthorQuestion],
        meta: { limit: 20, hasMore: false, nextCursor: null },
      });

      const res = await fetchQuestionsInBank(IDS.workspace, IDS.bank, { search: 'Consensus' });
      expect(api.get).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/question-banks/${IDS.bank}/questions?search=Consensus`,
      );
      expect(res.data).toHaveLength(1);
    });

    it('fetchQuestionDetail sends GET and parses detail', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockAuthorQuestion });

      const res = await fetchQuestionDetail(IDS.workspace, IDS.question);
      expect(api.get).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/questions/${IDS.question}`,
      );
      expect(res.id).toBe(IDS.question);
    });

    it('createQuestionInBank sends POST and parses created question', async () => {
      vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockAuthorQuestion });

      const res = await createQuestionInBank(IDS.workspace, IDS.bank, {
        title: 'Consensus Question',
        tags: ['distributed'],
        payload: mockQuestionVersionPayload,
      });
      expect(api.post).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/question-banks/${IDS.bank}/questions`,
        {
          title: 'Consensus Question',
          tags: ['distributed'],
          payload: mockQuestionVersionPayload,
        },
      );
      expect(res.title).toBe('Consensus Question');
    });

    it('updateQuestionMetadata sends PATCH with If-Match header', async () => {
      vi.spyOn(api, 'patch').mockResolvedValueOnce({ data: mockAuthorQuestion });

      await updateQuestionMetadata(
        IDS.workspace,
        IDS.question,
        { title: 'Consensus Question', tags: ['distributed'] },
        mockAuthorQuestion,
      );

      const expectedEtag = assessmentEtag(mockAuthorQuestion);
      expect(api.patch).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/questions/${IDS.question}`,
        { title: 'Consensus Question', tags: ['distributed'] },
        { headers: { 'If-Match': expectedEtag } },
      );
    });

    it('createQuestionVersion sends POST and parses created version', async () => {
      vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: mockAuthorQuestion.latestVersion,
      });

      const res = await createQuestionVersion(
        IDS.workspace,
        IDS.question,
        mockQuestionVersionPayload,
      );
      expect(api.post).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/questions/${IDS.question}/versions`,
        mockQuestionVersionPayload,
      );
      expect(res.version).toBe(1);
    });

    it('fetchQuestionVersions sends GET and parses cursor response', async () => {
      vi.spyOn(api, 'get').mockResolvedValueOnce({
        data: [mockAuthorQuestion.latestVersion],
        meta: { limit: 20, hasMore: false, nextCursor: null },
      });

      const res = await fetchQuestionVersions(IDS.workspace, IDS.question);
      expect(api.get).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/questions/${IDS.question}/versions`,
      );
      expect(res.data).toHaveLength(1);
    });

    it('archiveQuestion sends DELETE with If-Match header', async () => {
      const question = {
        id: IDS.question,
        updatedAt: '2026-10-26T02:00:00.000Z',
      };
      vi.spyOn(api, 'delete').mockResolvedValueOnce(undefined);

      await archiveQuestion(IDS.workspace, IDS.question, question);

      const expectedEtag = assessmentEtag(question);
      expect(api.delete).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/questions/${IDS.question}`,
        { headers: { 'If-Match': expectedEtag } },
      );
    });
  });

  describe('Assessments API', () => {
    it('createAssessment sends POST to lesson endpoint', async () => {
      const mockAssessment = {
        id: IDS.assessment,
        workspaceId: IDS.workspace,
        courseId: IDS.course,
        lessonId: IDS.lesson,
        kind: 'QUIZ' as const,
        title: 'Quiz 1',
        currentPublishedVersion: null,
        createdAt: '2026-10-26T00:00:00.000Z',
        updatedAt: '2026-10-26T00:00:00.000Z',
      };
      vi.spyOn(api, 'post').mockResolvedValueOnce({ data: mockAssessment });

      const res = await createAssessment(IDS.workspace, IDS.course, IDS.lesson, {
        kind: 'QUIZ',
        title: 'Quiz 1',
      });
      expect(api.post).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/courses/${IDS.course}/lessons/${IDS.lesson}/assessment`,
        { kind: 'QUIZ', title: 'Quiz 1' },
      );
      expect(res.title).toBe('Quiz 1');
    });

    it('fetchAssessmentDetail sends GET and parses detail', async () => {
      const mockAssessment = {
        id: IDS.assessment,
        workspaceId: IDS.workspace,
        courseId: IDS.course,
        lessonId: IDS.lesson,
        kind: 'QUIZ' as const,
        title: 'Quiz 1',
        currentPublishedVersion: 1,
        createdAt: '2026-10-26T00:00:00.000Z',
        updatedAt: '2026-10-26T00:00:00.000Z',
      };
      vi.spyOn(api, 'get').mockResolvedValueOnce({ data: mockAssessment });

      const res = await fetchAssessmentDetail(IDS.workspace, IDS.course, IDS.assessment);
      expect(api.get).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/courses/${IDS.course}/assessments/${IDS.assessment}`,
      );
      expect(res.id).toBe(IDS.assessment);
    });

    it('updateAssessmentVersion sends PATCH and parses version response', async () => {
      vi.spyOn(api, 'patch').mockResolvedValueOnce({ data: mockAssessmentVersionData });

      const res = await updateAssessmentVersion(
        IDS.workspace,
        IDS.course,
        IDS.assessment,
        IDS.assessmentVersion,
        { version: 1, passPercent: '70.00' },
      );
      expect(api.patch).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/courses/${IDS.course}/assessments/${IDS.assessment}/versions/${IDS.assessmentVersion}`,
        { version: 1, passPercent: '70.00' },
      );
      expect(res.version).toBe(1);
    });

    it('replaceAssessmentQuestions sends PUT and parses version response', async () => {
      vi.spyOn(api, 'put').mockResolvedValueOnce({ data: mockAssessmentVersionData });

      const questionsInput = {
        version: 1,
        questions: [
          {
            questionVersionId: IDS.questionVersion,
            points: '10.000',
            position: 0,
            isRequired: true,
          },
        ],
      };

      const res = await replaceAssessmentQuestions(
        IDS.workspace,
        IDS.course,
        IDS.assessment,
        IDS.assessmentVersion,
        questionsInput,
      );
      expect(api.put).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/courses/${IDS.course}/assessments/${IDS.assessment}/versions/${IDS.assessmentVersion}/questions`,
        questionsInput,
      );
      expect(res.version).toBe(1);
    });

    it('replaceAssessmentPools sends PUT and parses version response', async () => {
      vi.spyOn(api, 'put').mockResolvedValueOnce({ data: mockAssessmentVersionData });

      const poolsInput = {
        version: 1,
        pools: [
          {
            bankId: IDS.bank,
            position: 0,
            count: 3,
            pointsEach: '5.000',
            tags: [],
            questionType: null,
          },
        ],
      };

      const res = await replaceAssessmentPools(
        IDS.workspace,
        IDS.course,
        IDS.assessment,
        IDS.assessmentVersion,
        poolsInput,
      );
      expect(api.put).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/courses/${IDS.course}/assessments/${IDS.assessment}/versions/${IDS.assessmentVersion}/pools`,
        poolsInput,
      );
      expect(res.version).toBe(1);
    });

    it('upsertAccommodation sends PUT and parses accommodation response', async () => {
      const mockAccommodation = {
        id: '90000000-0000-4000-8000-000000000001',
        workspaceId: IDS.workspace,
        assessmentId: IDS.assessment,
        enrollmentId: IDS.enrollment,
        extraTimeSeconds: 600,
        extraAttempts: 1,
        availableUntil: null,
        reason: 'Accommodate extended timing request',
        grantedById: IDS.workspace,
        createdAt: '2026-10-26T00:00:00.000Z',
        updatedAt: '2026-10-26T00:00:00.000Z',
      };
      vi.spyOn(api, 'put').mockResolvedValueOnce({ data: mockAccommodation });

      const accommodationInput = {
        extraTimeSeconds: 600,
        extraAttempts: 1,
        availableUntil: null,
        reason: 'Accommodate extended timing request',
      };

      const res = await upsertAccommodation(
        IDS.workspace,
        IDS.course,
        IDS.assessment,
        IDS.enrollment,
        accommodationInput,
      );
      expect(api.put).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/courses/${IDS.course}/assessments/${IDS.assessment}/accommodations/${IDS.enrollment}`,
        accommodationInput,
      );
      expect(res).toBeDefined();
    });
  });

  describe('Assessment Draft Discovery and Read Routes', () => {
    it('fetchAssessmentVersions calls GET and parses version cursor response', async () => {
      const mockRaw = {
        data: [
          {
            ...mockAssessmentVersionData,
            status: 'PUBLISHED' as const,
            publishedAt: '2026-10-26T01:00:00.000Z',
          },
        ],
        meta: { limit: 20, hasMore: false, nextCursor: null },
      };

      vi.spyOn(api, 'get').mockResolvedValueOnce(mockRaw);

      const res = await fetchAssessmentVersions(IDS.workspace, IDS.course, IDS.assessment);
      expect(api.get).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/courses/${IDS.course}/assessments/${IDS.assessment}/versions`,
      );
      expect(res.data).toHaveLength(1);
      expect(res.data[0]?.status).toBe('PUBLISHED');
      expect(res.data[0]?.version).toBe(1);
    });

    it('fetchSelectedQuestions hydrates fixed questions for draft editor', async () => {
      const mockRaw = {
        data: {
          version: 1,
          questions: [
            {
              questionVersionId: IDS.questionVersion,
              points: '10.000',
              position: 0,
              isRequired: true,
            },
          ],
        },
      };

      vi.spyOn(api, 'get').mockResolvedValueOnce(mockRaw);

      const res = await fetchSelectedQuestions(
        IDS.workspace,
        IDS.course,
        IDS.assessment,
        IDS.assessmentVersion,
      );
      expect(api.get).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/courses/${IDS.course}/assessments/${IDS.assessment}/versions/${IDS.assessmentVersion}/questions`,
      );
      expect(res.version).toBe(1);
      expect(res.questions).toHaveLength(1);
      expect(res.questions[0]?.points).toBe('10.000');
    });

    it('fetchSelectedPools hydrates pools for draft editor', async () => {
      const mockRaw = {
        data: {
          version: 1,
          pools: [
            {
              bankId: IDS.bank,
              position: 0,
              count: 5,
              pointsEach: '2.000',
              tags: ['distributed'],
              questionType: 'MULTIPLE_CHOICE' as const,
            },
          ],
        },
      };

      vi.spyOn(api, 'get').mockResolvedValueOnce(mockRaw);

      const res = await fetchSelectedPools(
        IDS.workspace,
        IDS.course,
        IDS.assessment,
        IDS.assessmentVersion,
      );
      expect(api.get).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/courses/${IDS.course}/assessments/${IDS.assessment}/versions/${IDS.assessmentVersion}/pools`,
      );
      expect(res.version).toBe(1);
      expect(res.pools).toHaveLength(1);
      expect(res.pools[0]?.count).toBe(5);
    });

    it('createAssessmentVersion sends empty body {}', async () => {
      vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: {
          ...mockAssessmentVersionData,
          version: 2,
        },
      });

      const res = await createAssessmentVersion(IDS.workspace, IDS.course, IDS.assessment);
      expect(api.post).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/courses/${IDS.course}/assessments/${IDS.assessment}/versions`,
        {},
      );
      expect(res.version).toBe(2);
      expect(res.status).toBe('DRAFT');
    });

    it('publishAssessmentVersion sends empty body {} and returns published version', async () => {
      vi.spyOn(api, 'post').mockResolvedValueOnce({
        data: {
          ...mockAssessmentVersionData,
          status: 'PUBLISHED' as const,
          publishedAt: '2026-10-26T02:00:00.000Z',
        },
      });

      const res = await publishAssessmentVersion(
        IDS.workspace,
        IDS.course,
        IDS.assessment,
        IDS.assessmentVersion,
      );
      expect(api.post).toHaveBeenCalledWith(
        `/workspaces/${IDS.workspace}/courses/${IDS.course}/assessments/${IDS.assessment}/versions/${IDS.assessmentVersion}/publish`,
        {},
      );
      expect(res.status).toBe('PUBLISHED');
    });
  });
});
