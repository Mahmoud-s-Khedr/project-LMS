import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Notification } from '@prisma/client';
import {
  notificationSchema,
  securityNotificationTypeSchema,
  businessNotificationTypeSchema,
  notificationPreferenceSchema,
  mandatoryEmailNotificationTypes,
  type NotificationPreference,
  type NotificationsQuery,
  type NotificationPreferencesUpdate,
} from '@lms/shared';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ContentPagination } from '../content/content.support';

export function notificationDto(row: Notification) {
  return notificationSchema.parse({
    id: row.id,
    workspaceId: row.workspaceId,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}
export const mandatoryEmail = (type: string) =>
  (mandatoryEmailNotificationTypes as readonly string[]).includes(type);
export interface NotificationCommand {
  userId: string;
  workspaceId: string | null;
  type: NotificationPreference['type'];
  dedupeKey: string;
  title: string;
  body: string;
  data: Prisma.InputJsonObject;
}
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pagination: ContentPagination,
  ) {}
  /** Internal event command. Only template authors may supply content. Validates the same safe projection
   * that clients receive; arbitrary event payloads, capabilities and provider URLs are never copied. */
  async create(tx: Prisma.TransactionClient, input: NotificationCommand) {
    const { userId: _userId, dedupeKey: _dedupeKey, ...projection } = input;
    notificationSchema.parse({
      id: '00000000-0000-4000-8000-000000000000',
      ...projection,
      readAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`notifications:${input.userId}:${input.dedupeKey}`},0))`;
    const existing = await tx.notification.findUnique({
      where: { userId_dedupeKey: { userId: input.userId, dedupeKey: input.dedupeKey } },
    });
    if (existing) return existing;
    const user = await tx.user.findFirst({
      where: { id: input.userId, deletedAt: null, status: 'ACTIVE' },
    });
    if (!user) return null;
    const preferences = await tx.notificationPreference.findMany({
      where: { userId: input.userId, workspaceId: input.workspaceId, type: input.type },
    });
    const enabled = (channel: 'EMAIL' | 'IN_APP') =>
      (channel === 'EMAIL' && mandatoryEmail(input.type)) ||
      preferences.find((p) => p.channel === channel)?.enabled !== false;
    const row = await tx.notification.create({
      data: { ...input, ...(!enabled('IN_APP') ? { deletedAt: new Date() } : {}) },
    });
    for (const channel of ['EMAIL', 'IN_APP'] as const) {
      const on = enabled(channel);
      await tx.notificationDelivery.create({
        data: {
          workspaceId: input.workspaceId,
          notificationId: row.id,
          channel,
          recipient: channel === 'EMAIL' ? user.email : user.id,
          status: on ? (channel === 'IN_APP' ? 'SENT' : 'PENDING') : 'SUPPRESSED',
          sentAt: on && channel === 'IN_APP' ? new Date() : null,
          nextAttemptAt: on && channel === 'EMAIL' ? new Date() : null,
        },
      });
    }
    return row;
  }
  async list(userId: string, query: NotificationsQuery) {
    const { cursor: _cursor, limit: _limit, ...filters } = query;
    const scope = { userId, ...filters };
    const cursor = this.pagination.decode(query, scope);
    const rows = await this.prisma.notification.findMany({
      where: {
        userId,
        deletedAt: null,
        workspaceId: query.workspaceId,
        type: query.type,
        ...(query.unread === undefined ? {} : { readAt: query.unread ? null : { not: null } }),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.value) } },
                { createdAt: new Date(cursor.value), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = this.pagination.page(rows, query, scope, (r) => r.createdAt.toISOString());
    return { ...page, data: page.data.map(notificationDto) };
  }
  async mark(userId: string, id: string, read: boolean) {
    return this.prisma.$transaction(async (tx) => {
      if (
        !(
          await tx.notification.updateMany({
            where: { id, userId, deletedAt: null },
            data: { readAt: read ? new Date() : null },
          })
        ).count
      )
        throw new NotFoundException();
      return { data: notificationDto(await tx.notification.findUniqueOrThrow({ where: { id } })) };
    });
  }
  async readAll(userId: string, through: string) {
    await this.prisma.notification.updateMany({
      where: { userId, deletedAt: null, readAt: null, createdAt: { lte: new Date(through) } },
      data: { readAt: new Date() },
    });
    return { data: { success: true } };
  }
  async preferences(userId: string) {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: [{ workspaceId: 'asc' }, { type: 'asc' }, { channel: 'asc' }],
    });
    const workspaces = await this.prisma.workspace.findMany({
      where: {
        deletedAt: null,
        OR: [
          { members: { some: { userId, status: 'ACTIVE', deletedAt: null } } },
          { enrollments: { some: { userId } } },
          { notifications: { some: { userId } } },
        ],
      },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    const defaults: NotificationPreference[] = [];
    for (const type of securityNotificationTypeSchema.options)
      for (const channel of ['EMAIL', 'IN_APP'] as const)
        defaults.push({ workspaceId: null, type, channel, enabled: true });
    for (const workspace of workspaces)
      for (const type of businessNotificationTypeSchema.options)
        for (const channel of ['EMAIL', 'IN_APP'] as const)
          defaults.push({ workspaceId: workspace.id, type, channel, enabled: true });
    return {
      data: defaults.map((p) => {
        const saved = rows.find(
          (r) => r.workspaceId === p.workspaceId && r.type === p.type && r.channel === p.channel,
        );
        return notificationPreferenceSchema.parse({
          ...p,
          enabled:
            p.channel === 'EMAIL' && mandatoryEmail(p.type) ? true : (saved?.enabled ?? true),
        });
      }),
    };
  }

  async replacePreferences(userId: string, input: NotificationPreferencesUpdate) {
    await this.prisma.$transaction(async (tx) => {
      // Serialize replacement including nullable global scope (SQL partial unique index exists).
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${userId}::uuid FOR UPDATE`;
      const scopes = [
        ...new Set(
          input.preferences.map((p) => p.workspaceId).filter((s): s is string => s !== null),
        ),
      ];
      for (const workspaceId of scopes) {
        const exists = await tx.workspace.findFirst({
          where: {
            id: workspaceId,
            deletedAt: null,
            OR: [
              { members: { some: { userId, status: 'ACTIVE', deletedAt: null } } },
              { enrollments: { some: { userId } } },
              { notifications: { some: { userId } } },
            ],
          },
          select: { id: true },
        });
        if (!exists) throw new NotFoundException();
      }
      await tx.notificationPreference.deleteMany({ where: { userId } });
      if (input.preferences.length)
        await tx.notificationPreference.createMany({
          data: input.preferences.map((p) => ({ ...p, userId })),
        });
    });
    return this.preferences(userId);
  }
}
