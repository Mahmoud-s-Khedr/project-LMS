import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { NotificationPreference } from '@lms/shared';
import type { DeliveredEvent, EventConsumer } from '../events/event-consumer';
import { NotificationsService } from './notifications.service';
const TYPES = [
  'content.live-session.changed.v1',
  'enrollment.granted.v1',
  'assessment.submitted.v1',
  'assessment.graded.v1',
  'order.paid.v1',
  'refund.succeeded.v1',
  'subscription.entitlements.changed.v1',
  'certificate.issued.v1',
  'identity.password-changed.v1',
  'identity.refresh-reused.v1',
  'identity.sessions-revoked.v1',
  'identity.email-verified.v1',
] as const;
@Injectable()
export class NotificationsConsumer implements EventConsumer<(typeof TYPES)[number]> {
  readonly name = 'notifications.domain';
  readonly transactionTimeoutMs = 60000;
  readonly eventTypes = TYPES;
  constructor(private readonly notifications: NotificationsService) {}
  async handle(event: DeliveredEvent<(typeof TYPES)[number]>, tx: Prisma.TransactionClient) {
    let userId: string | undefined,
      type: NotificationPreference['type'] | undefined,
      title = '',
      body = '',
      path = '/student/notifications';
    const data: Record<string, string> = {};
    switch (event.type) {
      case 'content.live-session.changed.v1': {
        const session = await tx.liveSession.findFirst({
          where: {
            id: event.payload.sessionId,
            workspaceId: event.workspaceId,
            courseId: event.payload.courseId,
            deletedAt: null,
            workspace: { status: 'ACTIVE', deletedAt: null },
          },
          select: { id: true, courseId: true, cohortId: true, updatedAt: true },
        });
        if (!session) return;
        let after: string | undefined;
        for (;;) {
          const enrollments = await tx.enrollment.findMany({
            where: {
              workspaceId: event.workspaceId,
              courseId: session.courseId,
              status: 'ACTIVE',
              ...(session.cohortId ? { cohortId: session.cohortId } : {}),
              ...(after ? { id: { gt: after } } : {}),
            },
            orderBy: { id: 'asc' },
            take: 100,
          });
          for (const enrollment of enrollments)
            await this.notifications.create(tx, {
              workspaceId: event.workspaceId,
              userId: enrollment.userId,
              type: 'live.reminder',
              dedupeKey: `session-change:${session.id}:${session.updatedAt.toISOString()}:${enrollment.id}`,
              title: 'Live session update',
              body: 'The schedule or status of a live session in your course changed. Open your course for current details.',
              data: {
                courseId: session.courseId,
                enrollmentId: enrollment.id,
                path: `/learn/${enrollment.id}`,
              },
            });
          if (enrollments.length < 100) break;
          after = enrollments.at(-1)!.id;
        }
        return;
      }

      case 'enrollment.granted.v1': {
        const e = await tx.enrollment.findFirst({
          where: { id: event.payload.enrollmentId, workspaceId: event.workspaceId },
        });
        if (!e) return;
        userId = e.userId;
        type = 'enrollment.granted';
        title = 'Course access granted';
        body = 'Your course is ready to explore.';
        path = `/learn/${e.id}`;
        data.enrollmentId = e.id;
        data.courseId = e.courseId;
        break;
      }
      case 'assessment.submitted.v1':
      case 'assessment.graded.v1': {
        const attempt = await tx.assessmentAttempt.findFirst({
          where: { id: event.payload.attemptId, workspaceId: event.workspaceId },
          include: { enrollment: true },
        });
        if (!attempt) return;
        userId = attempt.enrollment.userId;
        type = event.type === 'assessment.graded.v1' ? 'assessment.graded' : 'assessment.submitted';
        title = type === 'assessment.graded' ? 'Assessment graded' : 'Assessment submitted';
        body = 'Check your assessment history for available details.';
        path = `/student/results/${attempt.enrollmentId}`;
        data.attemptId = attempt.id;
        break;
      }
      case 'order.paid.v1': {
        const order = await tx.order.findFirst({
          where: { id: event.payload.orderId, workspaceId: event.workspaceId, status: 'PAID' },
        });
        if (!order) return;
        userId = order.userId;
        type = 'order.paid';
        title = 'Payment confirmed';
        body = 'Your payment was received. View your order for details.';
        path = '/student/orders';
        data.orderId = order.id;
        break;
      }
      case 'refund.succeeded.v1': {
        const refund = await tx.refund.findFirst({
          where: {
            id: event.payload.refundId,
            workspaceId: event.workspaceId,
            status: 'SUCCEEDED',
          },
          include: { payment: { include: { order: true, subscription: true } } },
        });
        if (!refund) return;
        userId = refund.payment.order?.userId ?? refund.payment.subscription?.userId;
        type = 'order.refunded';
        title = 'Refund confirmed';
        body = 'Your refund has been processed. View your billing history for details.';
        path = '/student/orders';
        break;
      }
      case 'subscription.entitlements.changed.v1': {
        const subscription = await tx.subscription.findFirst({
          where: {
            id: event.payload.subscriptionId,
            workspaceId: event.workspaceId,
            status: { in: ['PAST_DUE', 'UNPAID'] },
          },
        });
        if (!subscription) return;
        userId = subscription.userId;
        type = 'subscription.payment_failed';
        title = 'Subscription payment needs attention';
        body = 'Review your billing details to maintain access.';
        path = '/student/subscriptions';
        data.subscriptionId = subscription.id;
        break;
      }
      case 'certificate.issued.v1': {
        const certificate = await tx.certificate.findFirst({
          where: { id: event.payload.certificateId, workspaceId: event.workspaceId },
          include: { enrollment: true },
        });
        if (!certificate) return;
        userId = certificate.enrollment.userId;
        type = 'certificate.issued';
        title = 'Certificate earned';
        body = 'Your certificate has been issued. Its PDF will be available after rendering.';
        path = '/student/certificates';
        data.certificateId = certificate.id;
        break;
      }
      case 'identity.password-changed.v1':
        type = 'security.password_changed';
        title = 'Password changed';
        body = 'Your password was changed. If this was unexpected, secure your account.';
        userId = event.payload.userId;
        break;
      case 'identity.refresh-reused.v1':
        type = 'security.refresh_reused';
        title = 'Session security alert';
        body = 'A reused session was detected and revoked. Review your active sessions.';
        userId = event.payload.userId;
        break;
      case 'identity.sessions-revoked.v1':
        type = 'security.password_changed';
        title = 'Sessions revoked';
        body = 'Your account sessions were revoked. Review your account security.';
        userId = event.payload.userId;
        break;
      case 'identity.email-verified.v1':
        return; // No matching notification contract; identity already confirms synchronously.
    }
    if (!userId || !type) return;
    await this.notifications.create(tx, {
      workspaceId: event.workspaceId,
      userId,
      type,
      title,
      body,
      data: { ...data, path },
      dedupeKey: `event:${event.id}`,
    });
  }
}
