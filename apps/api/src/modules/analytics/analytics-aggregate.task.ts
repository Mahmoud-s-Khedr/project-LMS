import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { BackgroundTaskHandler } from '../events/background-task';
import { AnalyticsReportsService } from './analytics-reports.service';
import { DAY } from './analytics.support';
@Injectable()
export class AnalyticsAggregateTask implements BackgroundTaskHandler {
  readonly name = 'analytics.daily-metrics';
  readonly everyMs = 60000;
  private cursor: string | undefined;
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: AnalyticsReportsService,
  ) {}
  async handle() {
    const courses = await this.prisma.course.findMany({
      where: { ...(this.cursor ? { id: { gt: this.cursor } } : {}) },
      orderBy: { id: 'asc' },
      take: 25,
      select: { id: true, workspaceId: true },
    });
    for (const course of courses) {
      await this.reports.recompute(
        { courseId: course.id, workspaceId: course.workspaceId },
        {
          from: new Date(Date.parse(new Date().toISOString().slice(0, 10)) - 7 * DAY).toISOString(),
        },
      );
      this.cursor = course.id;
    }
    if (courses.length < 25) this.cursor = undefined;
  }
}
