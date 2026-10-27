// Loaded only through commerce's NODE_ENV=test SDK injection seam. No network calls.
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const Stripe = require('../../apps/api/node_modules/stripe');
module.exports = class FixtureStripe extends Stripe {
  constructor(key, options) {
    super(key, options);
    const path = process.env.P5_STRIPE_FIXTURE_FILE;
    if (process.env.NODE_ENV !== 'test' || !path?.startsWith('/tmp/'))
      throw new Error('Stripe fixtures require NODE_ENV=test and a /tmp fixture store');
    const read = () => JSON.parse(fs.readFileSync(path, 'utf8'));
    const put = (object) => {
      const data = read();
      data[object.id] = object;
      fs.writeFileSync(path, JSON.stringify(data));
      return object;
    };
    const retrieve = async (id) => {
      const value = read()[id];
      if (!value) throw new Error(`Missing Stripe fixture ${id}`);
      return value;
    };
    this.customers = {
      create: async () => put({ id: `cus_test_${randomUUID()}`, livemode: false }),
    };
    this.checkout = {
      sessions: {
        create: async (params) => {
          const id = `cs_test_${randomUUID()}`;
          const amount = params.line_items.reduce((n, l) => n + l.price_data.unit_amount, 0);
          const currency = params.line_items[0].price_data.currency;
          const charge = put({
            id: `ch_test_${randomUUID()}`,
            created: Math.floor(Date.now() / 1000),
            amount,
            currency,
          });
          const intent = put({
            id: `pi_test_${randomUUID()}`,
            status: 'succeeded',
            amount,
            amount_received: amount,
            currency,
            latest_charge: charge.id,
          });
          return put({
            id,
            customer: params.customer,
            mode: params.mode,
            status: 'open',
            payment_status: 'unpaid',
            amount_total: amount,
            currency,
            payment_intent: intent.id,
            total_details: { amount_tax: 0 },
            created: Math.floor(Date.now() / 1000),
            expires_at: Math.floor(Date.now() / 1000) + 1800,
            url: `http://localhost:3100/checkout/success?fixture=${id}`,
            livemode: false,
          });
        },
        retrieve,
      },
    };
    this.paymentIntents = { retrieve };
    this.charges = { retrieve };
    this.refunds = {
      retrieve,
      create: async (params) => {
        const intent = await retrieve(params.payment_intent);
        return put({
          id: `re_test_${randomUUID()}`,
          status: 'succeeded',
          amount: params.amount,
          currency: intent.currency,
          payment_intent: intent.id,
          charge: intent.latest_charge,
          created: Math.floor(Date.now() / 1000),
        });
      },
    };
    this.subscriptions = { retrieve };
    this.invoices = { retrieve, list: async () => ({ data: [], has_more: false }) };
  }
};
