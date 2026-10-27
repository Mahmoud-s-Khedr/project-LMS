import { deliveryBackoff } from './notification-delivery.task';
import { mandatoryEmail } from './notifications.service';
import { notificationSchema, notificationPreferencesUpdateSchema } from '@lms/shared';
describe('notification security boundaries', () => {
  it.each([
    'security.password_reset',
    'order.paid',
    'certificate.issued',
    'subscription.payment_failed',
  ])('classifies %s as mandatory', (type) => expect(mandatoryEmail(type)).toBe(true));
  it.each(['live.reminder', 'course.released', 'assessment.graded'])(
    'classifies %s as optional',
    (type) => expect(mandatoryEmail(type)).toBe(false),
  );
  it('backs off exponentially within a one-hour ceiling', () => {
    expect([1, 2, 3, 8, 30].map((attempt) => deliveryBackoff(attempt, () => 0))).toEqual([
      30000, 60000, 120000, 3600000, 3600000,
    ]);
  });
  it('rejects duplicate and scope-invalid preferences', () => {
    const preference = {
      workspaceId: null,
      type: 'security.password_changed',
      channel: 'IN_APP',
      enabled: false,
    };
    expect(() =>
      notificationPreferencesUpdateSchema.parse({ preferences: [preference, preference] }),
    ).toThrow();
    expect(() =>
      notificationPreferencesUpdateSchema.parse({
        preferences: [{ ...preference, type: 'live.reminder' }],
      }),
    ).toThrow();
  });
  it.each(['//evil.test', 'https://evil.test', '/\\evil.test', 'javascript:alert(1)'])(
    'rejects untrusted deep link %s',
    (path) =>
      expect(() =>
        notificationSchema.parse({
          id: '00000000-0000-4000-8000-000000000001',
          workspaceId: null,
          type: 'security.password_changed',
          title: 'Security',
          body: 'Changed',
          data: { path },
          readAt: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
      ).toThrow(),
  );
});
