import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AuthController } from './auth.controller';
import type { AuthService } from './auth.service';
import type { AuthenticatedUser } from '../../common/authz/auth.types';

const expiresAt = new Date('2026-11-25T12:00:00Z');
const session = {
  refreshToken: 'a'.repeat(64),
  expiresAt,
  data: { accessToken: 'jwt', expiresIn: 600, user: { id: 'user' } },
};
const request = {
  cookies: { lms_refresh: session.refreshToken },
  get: jest.fn(),
} as unknown as Request;

describe('Session cookie transport', () => {
  function setup(environment = 'production') {
    const auth = {
      login: jest.fn().mockResolvedValue(session),
      refresh: jest.fn().mockResolvedValue(session),
      register: jest
        .fn()
        .mockResolvedValue({ data: { message: 'Check your email for next steps.' } }),
      logout: jest.fn().mockResolvedValue(undefined),
      logoutAll: jest.fn().mockResolvedValue(undefined),
    };
    const config = { get: jest.fn().mockReturnValue(environment) };
    const response = { cookie: jest.fn(), clearCookie: jest.fn() };
    const controller = new AuthController(
      auth as unknown as AuthService,
      config as unknown as ConfigService,
    );
    return { controller, response, auth };
  }

  it('issues host-only secure httpOnly CSRF cookies in production', () => {
    const { controller, response } = setup();
    controller.csrf(response as unknown as Response);
    expect(response.cookie).toHaveBeenCalledWith(
      'lms_csrf',
      expect.stringMatching(/^[a-f0-9]{64}$/),
      expect.objectContaining({
        httpOnly: true,
        secure: true,
        path: '/api/v1/auth',
        sameSite: 'lax',
      }),
    );
    expect(response.cookie.mock.calls[0]![2]).not.toHaveProperty('domain');
  });

  it.each(['login', 'refresh'] as const)(
    '%s issues a readable root hint with the same fixed family expiry as the refresh cookie',
    async (method) => {
      const { controller, response } = setup();
      const res = response as unknown as Response;
      const result =
        method === 'login'
          ? await controller.login(
              { email: 'user@example.com', password: 'password' },
              request,
              res,
            )
          : await controller.refresh(request, res);
      expect(result).toEqual({ data: session.data });
      expect(response.cookie).toHaveBeenCalledTimes(2);
      expect(response.cookie).toHaveBeenCalledWith('lms_refresh', session.refreshToken, {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/api/v1/auth',
        expires: expiresAt,
      });
      expect(response.cookie).toHaveBeenCalledWith('lms_session', '1', {
        httpOnly: false,
        secure: true,
        sameSite: 'lax',
        path: '/',
        expires: expiresAt,
      });
      for (const call of response.cookie.mock.calls) {
        expect(call[2]).not.toHaveProperty('domain');
      }
    },
  );

  it('allows both cookies on local HTTP', async () => {
    const { controller, response } = setup('development');
    await controller.refresh(request, response as unknown as Response);
    for (const call of response.cookie.mock.calls) {
      expect(call[2]).toHaveProperty('secure', false);
    }
  });

  it('does not issue session cookies for registration without login', async () => {
    const { controller, response } = setup();
    await controller.register({
      name: 'User',
      email: 'user@example.com',
      password: 'long-password-123',
      onboardingMode: 'STUDENT',
    });
    expect(response.cookie).not.toHaveBeenCalled();
  });

  it.each(['refresh failure', 'refresh reuse', 'logout', 'logout-all'])(
    '%s clears both cookies with their matching attributes',
    async (action) => {
      const { controller, response, auth } = setup();
      const res = response as unknown as Response;
      if (action.startsWith('refresh')) {
        auth.refresh.mockRejectedValueOnce(new Error(action));
        await expect(controller.refresh(request, res)).rejects.toThrow(action);
      } else if (action === 'logout') {
        await controller.logout(request, res);
        expect(auth.logout).toHaveBeenCalledWith(session.refreshToken);
      } else {
        await controller.logoutAll({ id: 'user' } as AuthenticatedUser, res);
        expect(auth.logoutAll).toHaveBeenCalledWith('user');
      }
      expect(response.clearCookie).toHaveBeenCalledTimes(2);
      expect(response.clearCookie).toHaveBeenCalledWith('lms_refresh', {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/api/v1/auth',
      });
      expect(response.clearCookie).toHaveBeenCalledWith('lms_session', {
        httpOnly: false,
        secure: true,
        sameSite: 'lax',
        path: '/',
      });
    },
  );
});
