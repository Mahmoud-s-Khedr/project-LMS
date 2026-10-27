import { Injectable } from '@nestjs/common';
import type { User } from '@prisma/client';
import type { SafeUser } from '@lms/shared';
import { StorageService } from '../../infrastructure/storage/storage.service';

@Injectable()
export class UserPresenter {
  constructor(private readonly storage: StorageService) {}
  async present(user: User): Promise<SafeUser> {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      platformRole: user.platformRole === 'SUPER_ADMIN' ? 'SUPER_ADMIN' : 'STUDENT',
      status: user.status,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      locale: user.locale,
      timezone: user.timezone,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      avatarUrl: user.avatarKey ? await this.storage.createDownloadUrl(user.avatarKey, 300) : null,
    };
  }
}
