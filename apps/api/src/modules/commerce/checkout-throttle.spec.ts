import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import { CommerceController } from './commerce.controller';
import { CommerceAdminService } from './commerce-admin.service';
import { CheckoutService } from './checkout.service';
import { BillingService } from './billing.service';

it('enforces the checkout session limit on the actual route', async () => {
  const module = await Test.createTestingModule({
    imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 1000 }])],
    controllers: [CommerceController],
    providers: [
      { provide: CommerceAdminService, useValue: {} },
      { provide: CheckoutService, useValue: {} },
      { provide: BillingService, useValue: {} },
    ],
  }).compile();
  const app = module.createNestApplication();
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address() as { port: number };
  try {
    const url = `http://127.0.0.1:${address.port}/workspaces/11111111-1111-4111-8111-111111111111/checkout/sessions`;
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++)
      statuses.push(
        (
          await fetch(url, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: '{}',
          })
        ).status,
      );
    expect(statuses.slice(0, 10)).not.toContain(429);
    expect(statuses[10]).toBe(429);
  } finally {
    await app.close();
  }
});
