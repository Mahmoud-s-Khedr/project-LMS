import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;
  hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 1,
    });
  }
  async verify(hash: string | null | undefined, password: string): Promise<boolean> {
    // Missing users/passwordless invitations still incur the password verification cost.
    if (!hash) this.dummyHash ??= this.hash('identity-dummy-password-never-used-for-login');
    const candidate = hash ?? (await this.dummyHash!);
    try {
      return (await argon2.verify(candidate, password)) && !!hash;
    } catch {
      return false;
    }
  }
}
