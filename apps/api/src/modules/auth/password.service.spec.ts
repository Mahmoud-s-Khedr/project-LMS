import { PasswordService } from './password.service';
describe('PasswordService', () => {
  it('uses salted Argon2id and verifies only the correct password', async () => {
    const service = new PasswordService();
    const hash = await service.hash('correct-password-123');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).not.toContain('correct-password-123');
    await expect(service.verify(hash, 'correct-password-123')).resolves.toBe(true);
    await expect(service.verify(hash, 'wrong-password-123')).resolves.toBe(false);
  });
  it('performs a dummy verification but cannot authenticate a missing or malformed hash', async () => {
    const service = new PasswordService();
    await expect(
      service.verify(null, 'identity-dummy-password-never-used-for-login'),
    ).resolves.toBe(false);
    await expect(service.verify('malformed', 'password')).resolves.toBe(false);
  });
});
