import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { MailService } from '../../infrastructure/mail/mail.service';
import type { BackgroundTaskHandler } from '../events/background-task';
import { mandatoryEmail } from './notifications.service';

export const deliveryBackoff = (attempt: number, random: () => number = Math.random) =>
  Math.min(3600000, 30000 * 2 ** Math.max(0, attempt - 1) * (1 + 0.2 * random()));
/** SMTP is outside transactions. A CAS lease prevents overlapping sends, including separate workers.
 * Accepted SMTP followed by process loss before SENT remains an unavoidable at-least-once boundary
 * until the shared MailService supports a provider idempotency key. */
@Injectable()
export class NotificationDeliveryTask implements BackgroundTaskHandler {
  readonly name = 'notifications.delivery';
  readonly everyMs = 15000;
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}
  async handle() {
    const now = new Date();
    await this.prisma.notificationDelivery.updateMany({
      where: {
        channel: 'EMAIL',
        status: 'SENDING',
        attempts: { gte: 8 },
        nextAttemptAt: { lte: now },
      },
      data: {
        status: 'FAILED',
        nextAttemptAt: null,
        lastError: 'Delivery lease expired after final attempt',
      },
    });
    const rows = await this.prisma.notificationDelivery.findMany({
      where: {
        channel: 'EMAIL',
        attempts: { lt: 8 },
        status: { in: ['PENDING', 'FAILED', 'SENDING'] },
        OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 50,
      include: { notification: true },
    });
    for (const row of rows) {
      const lease = `lease:${randomUUID()}`;
      const acquired = await this.prisma.notificationDelivery.updateMany({
        where: {
          id: row.id,
          status: row.status,
          attempts: row.attempts,
          OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
        },
        data: {
          status: 'SENDING',
          attempts: { increment: 1 },
          nextAttemptAt: new Date(Date.now() + 300000),
          providerMessageId: lease,
        },
      });
      if (!acquired.count) continue;
      try {
        const n = row.notification;
        const user = await this.prisma.user.findFirst({
          where: { id: n.userId, status: 'ACTIVE', deletedAt: null },
        });
        const preference = await this.prisma.notificationPreference.findFirst({
          where: { userId: n.userId, workspaceId: n.workspaceId, type: n.type, channel: 'EMAIL' },
        });
        let staleReminder = false;
        if (n.type === 'live.reminder' && n.dedupeKey.startsWith('live:')) {
          const parts = /^live:([a-f0-9-]{36}):(.+):([a-f0-9-]{36})$/.exec(n.dedupeKey);
          const session = parts
            ? await this.prisma.liveSession.findFirst({
                where: {
                  id: parts[1],
                  workspaceId: n.workspaceId ?? undefined,
                  status: 'SCHEDULED',
                  deletedAt: null,
                  startsAt: new Date(parts[2]!),
                },
              })
            : null;
          staleReminder = !session || session.startsAt <= new Date();
        }
        if (!user || staleReminder || (!mandatoryEmail(n.type) && preference?.enabled === false)) {
          await this.prisma.notificationDelivery.updateMany({
            where: { id: row.id, providerMessageId: lease },
            data: { status: 'SUPPRESSED', nextAttemptAt: null, providerMessageId: null },
          });
          continue;
        }
        // Text-only allowlisted template. No raw event JSON, address, scores, tokens or answer keys in content.
        const messageId = `<lms-delivery-${row.id}@notifications.lms>`;
        const message = { to: user.email, subject: n.title, text: n.body, messageId };
        await this.mail.send(message);
        await this.prisma.notificationDelivery.updateMany({
          where: { id: row.id, providerMessageId: lease },
          data: {
            status: 'SENT',
            sentAt: new Date(),
            nextAttemptAt: null,
            lastError: null,
            providerMessageId: messageId,
            recipient: user.email,
          },
        });
      } catch {
        await this.prisma.notificationDelivery.updateMany({
          where: { id: row.id, providerMessageId: lease },
          data: {
            status: 'FAILED',
            lastError: 'Mail delivery failed',
            providerMessageId: null,
            nextAttemptAt:
              row.attempts + 1 >= 8
                ? null
                : new Date(Date.now() + deliveryBackoff(row.attempts + 1)),
          },
        });
      }
    }
  }
}
