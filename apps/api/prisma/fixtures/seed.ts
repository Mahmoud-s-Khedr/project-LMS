import { Buffer } from 'node:buffer';
import { hash, argon2id } from 'argon2';
import { Prisma, PrismaClient, QuestionType, Role } from '@prisma/client';
import { fixtureEnd, fixtureId as id, fixtureTime as now } from './ids';

const document = (text: string): Prisma.InputJsonObject => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

/** Insert-only upserts preserve edits, immutable history and passwords on reruns. */
export async function seedDevelopment(prisma: PrismaClient): Promise<void> {
  const passwordHash = await hash('Lms-demo-only!2026', {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    salt: Buffer.from('lms-fixture-only!'),
  });
  await prisma.$transaction(
    async (db) => {
      // Serialize reruns against each other without locking normal application writes.
      await db.$executeRaw`SELECT pg_advisory_xact_lock(713042601)`;
      const people = [
        ['admin', 'Platform Admin', Role.SUPER_ADMIN],
        ['owner', 'Academy Owner', Role.STUDENT],
        ['instructor', 'Independent Instructor', Role.STUDENT],
        ['ta', 'Teaching Assistant', Role.STUDENT],
        ['student', 'Demo Student', Role.STUDENT],
        ['other-student', 'Second Student', Role.STUDENT],
      ] as const;
      for (const [key, name, platformRole] of people) {
        await db.user.upsert({
          where: { id: id(key) },
          update: {},
          create: {
            id: id(key),
            email: `${key}@example.test`,
            name,
            platformRole,
            passwordHash,
            emailVerifiedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
      for (const [key, kind, owner] of [
        ['personal', 'PERSONAL', 'instructor'],
        ['academy', 'ACADEMY', 'owner'],
      ] as const) {
        await db.workspace.upsert({
          where: { id: id(key) },
          update: {},
          create: {
            id: id(key),
            slug: `demo-${key}`,
            name: `Demo ${key}`,
            kind,
            ownerId: id(owner),
            createdAt: now,
            updatedAt: now,
          },
        });
      }
      for (const [workspace, user, role] of [
        ['personal', 'instructor', Role.ADMIN],
        ['academy', 'owner', Role.ADMIN],
        ['academy', 'instructor', Role.INSTRUCTOR],
        ['academy', 'ta', Role.TEACHING_ASSISTANT],
        ['academy', 'student', Role.STUDENT],
      ] as const) {
        const key = `member:${workspace}:${user}`;
        await db.workspaceMember.upsert({
          where: { id: id(key) },
          update: {},
          create: {
            id: id(key),
            workspaceId: id(workspace),
            userId: id(user),
            role,
            joinedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
      for (const [key, workspace, isFree, deliveryMode] of [
        ['free', 'personal', true, 'SELF_PACED'],
        ['paid', 'academy', false, 'SELF_PACED'],
        ['cohort', 'academy', false, 'COHORT'],
      ] as const) {
        const workspaceId = id(workspace),
          courseId = id(key);
        await db.course.upsert({
          where: { id: courseId },
          update: {},
          create: {
            id: courseId,
            workspaceId,
            slug: `demo-${key}`,
            title: `Demo ${key} course`,
            summary: 'Development fixture for learning and selling courses.',
            description: document('Welcome to the demo course.'),
            status: 'PUBLISHED',
            publishedAt: now,
            isFree,
            deliveryMode,
            createdById: id('instructor'),
            createdAt: now,
            updatedAt: now,
          },
        });
        await db.section.upsert({
          where: { id: id(`section:${key}`) },
          update: {},
          create: {
            id: id(`section:${key}`),
            workspaceId,
            courseId,
            title: 'Getting started',
            position: 0,
            createdAt: now,
            updatedAt: now,
          },
        });
        await db.lesson.upsert({
          where: { id: id(`intro:${key}`) },
          update: {},
          create: {
            id: id(`intro:${key}`),
            workspaceId,
            courseId,
            sectionId: id(`section:${key}`),
            title: 'Introduction',
            type: 'TEXT',
            body: document('Read and acknowledge this introduction.'),
            position: 0,
            isPublished: true,
            isPreview: true,
            createdAt: now,
            updatedAt: now,
          },
        });
        for (const user of workspace === 'academy' ? ['instructor', 'ta'] : ['instructor']) {
          await db.courseStaff.upsert({
            where: { id: id(`staff:${key}:${user}`) },
            update: {},
            create: {
              id: id(`staff:${key}:${user}`),
              workspaceId,
              courseId,
              userId: id(user),
              role: user === 'ta' ? 'TEACHING_ASSISTANT' : 'INSTRUCTOR',
              canEditContent: user !== 'ta',
              canGrade: true,
              canManageLearners: user !== 'ta',
              createdAt: now,
              updatedAt: now,
            },
          });
        }
        if (key === 'cohort') {
          await db.cohort.upsert({
            where: { id: id('cohort:run') },
            update: {},
            create: {
              id: id('cohort:run'),
              workspaceId,
              courseId,
              name: 'Demo open cohort',
              startsAt: now,
              endsAt: fixtureEnd,
              enrollmentOpensAt: now,
              enrollmentClosesAt: fixtureEnd,
              capacity: 30,
              isPublished: true,
              createdAt: now,
              updatedAt: now,
            },
          });
        }
        await db.enrollment.upsert({
          where: { id: id(`enrollment:${key}`) },
          update: {},
          create: {
            id: id(`enrollment:${key}`),
            workspaceId,
            courseId,
            userId: id('student'),
            cohortId: key === 'cohort' ? id('cohort:run') : null,
            enrolledAt: now,
            policySnapshot: {
              requiredLessonIds: [id(`intro:${key}`)],
              criteria: { [id(`intro:${key}`)]: 'ACKNOWLEDGE' },
            },
            createdAt: now,
            updatedAt: now,
          },
        });
        if (isFree)
          await db.enrollmentGrant.upsert({
            where: { id: id('grant:free') },
            update: {},
            create: {
              id: id('grant:free'),
              workspaceId,
              enrollmentId: id('enrollment:free'),
              source: 'FREE',
              sourceKey: 'free:self-enrollment',
              startsAt: now,
              createdAt: now,
              updatedAt: now,
            },
          });
        else
          await db.enrollmentGrant.upsert({
            where: { id: id(`grant:manual:${key}`) },
            update: {},
            create: {
              id: id(`grant:manual:${key}`),
              workspaceId,
              enrollmentId: id(`enrollment:${key}`),
              source: 'MANUAL',
              sourceKey: `manual:demo:${key}`,
              reason: 'Development fixture access',
              grantedById: id('owner'),
              startsAt: now,
              expiresAt: fixtureEnd,
              createdAt: now,
              updatedAt: now,
            },
          });
      }
      const workspaceId = id('academy');
      await db.questionBank.upsert({
        where: { id: id('bank') },
        update: {},
        create: {
          id: id('bank'),
          workspaceId,
          name: 'All question types',
          createdById: id('instructor'),
          createdAt: now,
          updatedAt: now,
        },
      });
      const keys: Record<QuestionType, Prisma.InputJsonObject> = {
        SINGLE_CHOICE: { correctOptionKeys: ['a'] },
        MULTIPLE_CHOICE: { correctOptionKeys: ['a', 'c'] },
        TRUE_FALSE: { value: true },
        SHORT_ANSWER: { accepted: ['database'] },
        NUMERIC: { value: '12.5', absoluteTolerance: '0.01' },
        ESSAY: {},
        FILE_UPLOAD: {},
        MATCHING: {
          pairs: [
            { leftKey: 'l1', rightKey: 'r1' },
            { leftKey: 'l2', rightKey: 'r2' },
          ],
        },
        ORDERING: { optionKeys: ['a', 'b', 'c'] },
      };
      for (const type of Object.values(QuestionType)) {
        await db.question.upsert({
          where: { id: id(`question:${type}`) },
          update: {},
          create: {
            id: id(`question:${type}`),
            workspaceId,
            bankId: id('bank'),
            title: `Demo ${type}`,
            tags: ['demo'],
            createdById: id('instructor'),
            createdAt: now,
            updatedAt: now,
          },
        });
        await db.questionVersion.upsert({
          where: { id: id(`qv:${type}`) },
          update: {},
          create: {
            id: id(`qv:${type}`),
            workspaceId,
            questionId: id(`question:${type}`),
            version: 1,
            type,
            prompt: document(`Answer the ${type} example.`),
            answerKey: keys[type],
            gradingConfig:
              type === 'SHORT_ANSWER'
                ? { caseSensitive: false, trim: true, collapseWhitespace: true }
                : {},
            defaultPoints: '10',
            createdAt: now,
          },
        });
        const options =
          type === 'MATCHING'
            ? ['l1', 'l2', 'r1', 'r2']
            : ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'ORDERING'].includes(type)
              ? ['a', 'b', 'c']
              : [];
        for (const [position, key] of options.entries()) {
          await db.questionOption.upsert({
            where: { id: id(`option:${type}:${key}`) },
            update: {},
            create: {
              id: id(`option:${type}:${key}`),
              workspaceId,
              questionVersionId: id(`qv:${type}`),
              key,
              position,
              content:
                type === 'MATCHING'
                  ? { group: key.startsWith('l') ? 'LEFT' : 'RIGHT', document: document(key) }
                  : document(key),
              createdAt: now,
            },
          });
        }
      }
      for (const [kind, courseKey, types] of [
        [
          'QUIZ',
          'paid',
          [
            'SINGLE_CHOICE',
            'MULTIPLE_CHOICE',
            'TRUE_FALSE',
            'SHORT_ANSWER',
            'NUMERIC',
            'MATCHING',
            'ORDERING',
          ],
        ],
        ['ASSIGNMENT', 'paid', ['ESSAY', 'FILE_UPLOAD']],
        ['EXAM', 'cohort', ['SINGLE_CHOICE', 'NUMERIC']],
      ] as const) {
        const courseId = id(courseKey),
          lessonId = id(`lesson:${kind}`),
          assessmentId = id(`assessment:${kind}`);
        await db.lesson.upsert({
          where: { id: lessonId },
          update: {},
          create: {
            id: lessonId,
            workspaceId,
            courseId,
            sectionId: id(`section:${courseKey}`),
            title: `Demo ${kind}`,
            type: kind,
            position: kind === 'ASSIGNMENT' ? 2 : 1,
            completionRule: 'ASSESSMENT_PASS',
            isPublished: true,
            isRequired: false,
            createdAt: now,
            updatedAt: now,
          },
        });
        await db.assessment.upsert({
          where: { id: assessmentId },
          update: {},
          create: {
            id: assessmentId,
            workspaceId,
            courseId,
            lessonId,
            kind,
            title: `Demo ${kind}`,
            currentPublishedVersion: 2,
            createdAt: now,
            updatedAt: now,
          },
        });
        for (const version of [1, 2]) {
          const assessmentVersionId = id(`av:${kind}:${version}`);
          await db.assessmentVersion.upsert({
            where: { id: assessmentVersionId },
            update: {},
            create: {
              id: assessmentVersionId,
              workspaceId,
              assessmentId,
              version,
              status: version === 1 ? 'RETIRED' : 'PUBLISHED',
              maxAttempts: 3,
              instructions: document('Complete all items.'),
              timeLimitSeconds: kind === 'EXAM' ? 1800 : null,
              feedbackPolicy: 'AFTER_GRADING',
              publishedAt: now,
              rubric:
                kind === 'ASSIGNMENT'
                  ? {
                      criteria: [
                        { id: 'clarity', label: 'Clarity', maxPoints: version === 1 ? '10' : '20' },
                      ],
                    }
                  : Prisma.DbNull,
              allowedFileTypes: ['application/pdf', 'text/plain', 'image/jpeg', 'image/png'],
              createdAt: now,
              updatedAt: now,
            },
          });
          for (const [position, type] of (kind === 'ASSIGNMENT' && version === 1
            ? (['ESSAY'] as const)
            : types
          ).entries())
            await db.assessmentQuestion.upsert({
              where: { id: id(`aq:${kind}:${version}:${type}`) },
              update: {},
              create: {
                id: id(`aq:${kind}:${version}:${type}`),
                workspaceId,
                assessmentVersionId,
                questionVersionId: id(`qv:${type}`),
                position,
                points: '10',
                createdAt: now,
              },
            });
        }
      }
      // A frozen, manually graded historical assignment with an append-only correction.
      const attemptId = id('attempt:historical'),
        answerId = id('answer:historical');
      await db.assessmentAttempt.upsert({
        where: { id: attemptId },
        update: {},
        create: {
          id: attemptId,
          workspaceId,
          courseId: id('paid'),
          enrollmentId: id('enrollment:paid'),
          assessmentId: id('assessment:ASSIGNMENT'),
          assessmentVersionId: id('av:ASSIGNMENT:1'),
          number: 1,
          status: 'GRADED',
          randomSeed: 'development-snapshot-only',
          startedAt: now,
          submittedAt: now,
          gradedAt: now,
          deliverySnapshot: {
            feedbackPolicy: 'AFTER_GRADING',
            passPercent: '60',
            gradePolicy: 'HIGHEST',
            rubric: { criteria: [{ id: 'clarity', label: 'Clarity', maxPoints: '10' }] },
          },
          totalPoints: '10',
          awardedPoints: '8',
          percent: '80',
          passed: true,
          createdAt: now,
          updatedAt: now,
        },
      });
      for (const [position, type] of (['ESSAY'] as const).entries()) {
        const attemptQuestionId = id(`attempt-question:${type}`);
        await db.attemptQuestion.upsert({
          where: { id: attemptQuestionId },
          update: {},
          create: {
            id: attemptQuestionId,
            workspaceId,
            attemptId,
            questionVersionId: id(`qv:${type}`),
            position,
            points: '10',
            questionSnapshot: {
              type,
              prompt: document(`Answer the ${type} example.`),
              options: [],
            },
            createdAt: now,
          },
        });
        await db.attemptAnswer.upsert({
          where: { id: type === 'ESSAY' ? answerId : id('answer:file') },
          update: {},
          create: {
            id: type === 'ESSAY' ? answerId : id('answer:file'),
            workspaceId,
            attemptId,
            attemptQuestionId,
            response:
              type === 'ESSAY'
                ? { type, document: document('My historical submission.') }
                : { type, note: 'Demo submission' },
            awardedPoints: '8',
            requiresManualGrading: true,
            feedback: 'Clear work.',
            savedAt: now,
            createdAt: now,
            updatedAt: now,
          },
        });
      }
      for (const [key, previousPoints, awardedPoints, reason] of [
        ['initial', null, '7', 'Initial manual grade'],
        ['correction', '7', '8', 'Clarified rubric review'],
      ] as const)
        await db.gradeEvent.upsert({
          where: { id: id(`grade:${key}`) },
          update: {},
          create: {
            id: id(`grade:${key}`),
            workspaceId,
            attemptId,
            answerId,
            gradedById: id('instructor'),
            previousPoints,
            awardedPoints,
            reason,
            createdAt: new Date(now.getTime() + (key === 'correction' ? 1000 : 0)),
          },
        });
      await seedCommerce(db);
    },
    { timeout: 30000 },
  );
}

async function seedCommerce(db: Prisma.TransactionClient): Promise<void> {
  const workspaceId = id('academy');
  for (const [key, type, amount, interval, courseKeys] of [
    ['single', 'COURSE', 4900, null, ['paid']],
    ['bundle', 'BUNDLE', 7900, null, ['paid', 'cohort']],
    ['plan', 'SUBSCRIPTION_PLAN', 1900, 'MONTH', ['paid']],
  ] as const) {
    await db.product.upsert({
      where: { id: id(`product:${key}`) },
      update: {},
      create: {
        id: id(`product:${key}`),
        workspaceId,
        type,
        status: 'ACTIVE',
        slug: `demo-${key}`,
        name: `Demo ${key}`,
        description: document('Development product; no live payment provider mapping.'),
        createdAt: now,
        updatedAt: now,
      },
    });
    await db.price.upsert({
      where: { id: id(`price:${key}`) },
      update: {},
      create: {
        id: id(`price:${key}`),
        workspaceId,
        productId: id(`product:${key}`),
        currency: 'usd',
        amount,
        interval,
        createdAt: now,
        updatedAt: now,
      },
    });
    for (const [position, courseKey] of courseKeys.entries())
      await db.productCourse.upsert({
        where: { id: id(`product-course:${key}:${courseKey}`) },
        update: {},
        create: {
          id: id(`product-course:${key}:${courseKey}`),
          workspaceId,
          productId: id(`product:${key}`),
          courseId: id(courseKey),
          position,
          createdAt: now,
          updatedAt: now,
        },
      });
  }
  await db.coupon.upsert({
    where: { id: id('coupon') },
    update: {},
    create: {
      id: id('coupon'),
      workspaceId,
      code: 'DEMO20',
      kind: 'PERCENT',
      percentOff: '20',
      validFrom: now,
      validUntil: fixtureEnd,
      maxRedemptions: 100,
      createdAt: now,
      updatedAt: now,
    },
  });
  await db.order.upsert({
    where: { id: id('order') },
    update: {},
    create: {
      id: id('order'),
      workspaceId,
      userId: id('student'),
      number: 'DEMO-P1D-0001',
      status: 'PAID',
      currency: 'usd',
      subtotal: 4900,
      grandTotal: 4900,
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });
  await db.orderItem.upsert({
    where: { id: id('order-item') },
    update: {},
    create: {
      id: id('order-item'),
      workspaceId,
      orderId: id('order'),
      productId: id('product:single'),
      priceId: id('price:single'),
      productSnapshot: { name: 'Demo single', type: 'COURSE' },
      entitlementSnapshot: {
        courses: [{ courseId: id('paid'), cohortId: null, accessDurationDays: null }],
      },
      unitAmount: 4900,
      totalAmount: 4900,
      createdAt: now,
    },
  });
  await db.orderItemCourse.upsert({
    where: { id: id('order-item-course') },
    update: {},
    create: {
      id: id('order-item-course'),
      workspaceId,
      orderItemId: id('order-item'),
      courseId: id('paid'),
      createdAt: now,
    },
  });
  await db.payment.upsert({
    where: { id: id('payment') },
    update: {},
    create: {
      id: id('payment'),
      workspaceId,
      orderId: id('order'),
      status: 'SUCCEEDED',
      currency: 'usd',
      amount: 4900,
      paidAt: now,
      createdAt: now,
      updatedAt: now,
    },
  });
  // Required provider columns use reserved fixture identifiers, never Stripe-shaped IDs.
  await db.billingCustomer.upsert({
    where: { id: id('customer') },
    update: {},
    create: {
      id: id('customer'),
      workspaceId,
      userId: id('student'),
      stripeCustomerId: 'fixture-only:customer:student',
      createdAt: now,
      updatedAt: now,
    },
  });
  await db.subscription.upsert({
    where: { id: id('subscription') },
    update: {},
    create: {
      id: id('subscription'),
      workspaceId,
      userId: id('student'),
      productId: id('product:plan'),
      priceId: id('price:plan'),
      customerId: id('customer'),
      stripeSubscriptionId: 'fixture-only:subscription:student',
      status: 'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd: fixtureEnd,
      entitlementSnapshot: { courses: [{ courseId: id('paid'), cohortId: null }] },
      createdAt: now,
      updatedAt: now,
    },
  });
  for (const source of ['ORDER_ITEM', 'SUBSCRIPTION'] as const)
    await db.enrollmentGrant.upsert({
      where: { id: id(`grant:${source}`) },
      update: {},
      create: {
        id: id(`grant:${source}`),
        workspaceId,
        enrollmentId: id('enrollment:paid'),
        source,
        sourceKey:
          source === 'ORDER_ITEM'
            ? `order-item:${id('order-item')}:course:${id('paid')}`
            : `subscription:${id('subscription')}:course:${id('paid')}`,
        orderItemId: source === 'ORDER_ITEM' ? id('order-item') : null,
        subscriptionId: source === 'SUBSCRIPTION' ? id('subscription') : null,
        startsAt: now,
        expiresAt: source === 'SUBSCRIPTION' ? fixtureEnd : null,
        createdAt: now,
        updatedAt: now,
      },
    });
}
