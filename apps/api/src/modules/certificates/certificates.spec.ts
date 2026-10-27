import { certificateHtml, escapeHtml } from './certificate-renderer';
import { maskName } from './certificates.service';
import {
  certificateLayoutSchema,
  notificationPreferencesUpdateSchema,
  certificateVerificationSchema,
} from '@lms/shared';
describe('certificate presentation and input boundaries', () => {
  const input = {
    layout: {
      orientation: 'LANDSCAPE',
      title: 'Achievement',
      body: 'Learning completed',
      accentColor: '#126978',
    },
    recipientName: 'أحمد علي',
    courseTitle: 'Security <script>secret()</script>',
    issuerName: 'Academy & Partners',
    verificationCode: 'a'.repeat(43),
    issuedAt: new Date('2026-10-26T00:00:00Z'),
  };
  it('escapes author and learner text and denies active content/network', () => {
    const html = certificateHtml(input);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain('أحمد علي');
    expect(html).toContain('Academy &amp; Partners');
  });
  it.each(['red', 'url(https://evil.test)', '#123456;display:none'])(
    'rejects CSS injection %s',
    (accentColor) =>
      expect(() => certificateLayoutSchema.parse({ ...input.layout, accentColor })).toThrow(),
  );
  it('escapes all HTML delimiters', () =>
    expect(escapeHtml('<"&\'>')).toBe('&lt;&quot;&amp;&#39;&gt;'));
  it.each([
    ['Ada Lovelace', 'A*** L***'],
    ['أحمد علي', 'أ*** ع***'],
    ['李', '李***'],
    ['👩🏽‍💻 Learner', '👩*** L***'],
  ])('masks names without retaining surnames: %s', (name, expected) =>
    expect(maskName(name)).toBe(expected),
  );
  it('public verification rejects private identity/file fields', () =>
    expect(() =>
      certificateVerificationSchema.parse({
        status: 'VALID',
        courseTitle: 'C',
        issuerName: 'I',
        issuedAt: input.issuedAt.toISOString(),
        maskedRecipientName: 'A***',
        email: 'private@test.local',
        url: 'https://private.test',
      }),
    ).toThrow());
  it('mandatory transactional email cannot be opted out', () =>
    expect(() =>
      notificationPreferencesUpdateSchema.parse({
        preferences: [
          {
            workspaceId: '00000000-0000-4000-8000-000000000001',
            type: 'order.paid',
            channel: 'EMAIL',
            enabled: false,
          },
        ],
      }),
    ).toThrow());
});
