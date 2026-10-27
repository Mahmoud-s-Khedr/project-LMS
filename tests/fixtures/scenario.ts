import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { TestDbHelper } from './database';
import { createAndLoginTestUser, type TestUser } from './auth';
import { createStripeWebhookEvent, computeStripeSignature } from './stripe';

export const fixtureId = (key: string) => {
  const hex = createHash('sha256').update(`lms-development-fixture:${key}`).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
};
export const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
export async function eventually<T>(read: () => Promise<T>, accept: (value: T) => boolean, timeout = 45000): Promise<T> {
  const until = Date.now() + timeout;
  let value: T;
  do { value = await read(); if (accept(value)) return value; await new Promise(r => setTimeout(r, 250)); } while (Date.now() < until);
  throw new Error(`Timed out waiting for fixture state: ${JSON.stringify(value)}`);
}

/** Persisted fixture graph in a disposable QA database. All behavior assertions use the live API/worker. */
export class Scenario {
  db = new TestDbHelper();
  workspaceId = randomUUID(); courseId = randomUUID(); sectionId = randomUUID(); lessonId = randomUUID();
  quizId = randomUUID(); assignmentId = randomUUID(); productId = randomUUID(); priceId = randomUUID();
  quizLesson = randomUUID(); assignmentLesson = randomUUID();
  owner!: TestUser; learner!: TestUser;
  async clone(table: string, source: string, changes: Record<string, unknown>) {
    if (!/^[A-Za-z]+$/.test(table)) throw new Error('Unsafe fixture table');
    const [row] = await this.db.query(`SELECT row_to_json(t) AS row FROM "${table}" t WHERE id=$1`, [source]);
    if (!row) throw new Error(`Missing seeded ${table} ${source}`);
    const data = { ...row.row, id: randomUUID(), ...changes };
    await this.db.query(`INSERT INTO "${table}" SELECT * FROM json_populate_record(NULL::"${table}", $1::json)`, [JSON.stringify(data)]);
    return data;
  }
  async setup(learner?: TestUser) {
    if (!process.env.P5_QA_DATABASE || !new URL(process.env.DATABASE_URL!).pathname.startsWith('/lms_p5_qa_'))
      throw new Error('Live QA fixtures require a disposable lms_p5_qa_* database');
    this.owner = await createAndLoginTestUser({ direct: true });
    this.learner = learner ?? await createAndLoginTestUser({ direct: true });
    await this.clone('Workspace', fixtureId('academy'), { id: this.workspaceId, slug: `qa-${this.workspaceId}`, ownerId: this.owner.id });
    await this.clone('WorkspaceMember', fixtureId('member:academy:owner'), { workspaceId: this.workspaceId, userId: this.owner.id });
    await this.clone('Course', fixtureId('paid'), { id: this.courseId, workspaceId: this.workspaceId, slug: `qa-${this.courseId}`, title: 'Release journey', createdById: this.owner.id });
    await this.clone('Section', fixtureId('section:paid'), { id: this.sectionId, workspaceId: this.workspaceId, courseId: this.courseId });
    await this.clone('Lesson', fixtureId('intro:paid'), { id: this.lessonId, workspaceId: this.workspaceId, courseId: this.courseId, sectionId: this.sectionId, isRequired: true });
    const bank = await this.clone('QuestionBank', fixtureId('bank'), { workspaceId: this.workspaceId, createdById: this.owner.id });
    for (const [kind, type, assessmentId, lessonId] of [
      ['QUIZ', 'TRUE_FALSE', this.quizId, this.quizLesson], ['ASSIGNMENT', 'ESSAY', this.assignmentId, this.assignmentLesson],
    ]) {
      await this.clone('Lesson', fixtureId(`lesson:${kind}`), { id: lessonId, workspaceId: this.workspaceId, courseId: this.courseId, sectionId: this.sectionId, isRequired: true });
      await this.clone('Assessment', fixtureId(`assessment:${kind}`), { id: assessmentId, workspaceId: this.workspaceId, courseId: this.courseId, lessonId });
      const version = await this.clone('AssessmentVersion', fixtureId(`av:${kind}:2`), { workspaceId: this.workspaceId, assessmentId, timeLimitSeconds: kind === 'QUIZ' ? 60 : null, rubric: null });
      const question = await this.clone('Question', fixtureId(`question:${type}`), { workspaceId: this.workspaceId, bankId: bank.id, createdById: this.owner.id });
      const qv = await this.clone('QuestionVersion', fixtureId(`qv:${type}`), { workspaceId: this.workspaceId, questionId: question.id });
      await this.clone('AssessmentQuestion', fixtureId(`aq:${kind}:2:${type}`), { workspaceId: this.workspaceId, assessmentVersionId: version.id, questionVersionId: qv.id, position: 0 });
    }
    await this.clone('Product', fixtureId('product:single'), { id: this.productId, workspaceId: this.workspaceId, slug: `qa-${this.productId}` });
    await this.clone('Price', fixtureId('price:single'), { id: this.priceId, workspaceId: this.workspaceId, productId: this.productId });
    await this.clone('ProductCourse', fixtureId('product-course:single:paid'), { workspaceId: this.workspaceId, productId: this.productId, courseId: this.courseId });
    return this;
  }
  async webhook(type: string, id: string, eventId?: string) {
    const event = createStripeWebhookEvent({ type, data: { id }, eventId });
    const response = await fetch('http://localhost:4100/api/v1/webhooks/stripe', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Stripe-Signature': computeStripeSignature(event.rawBody, process.env.STRIPE_WEBHOOK_SECRET!) }, body: event.rawBody,
    });
    if (response.status !== 200) throw new Error(`Webhook ${response.status}: ${await response.text()}`);
    return event.eventId;
  }
  async purchase() {
    const result = await this.learner.client.post('/checkout/sessions', { workspaceId: this.workspaceId, items: [{ priceId: this.priceId }], successPath: '/checkout/success', cancelPath: '/courses' }, { idempotencyKey: randomUUID() });
    if (result.status !== 201) throw new Error(`Checkout ${result.status}: ${result.rawText}`);
    const orderId = result.data.data.orderId;
    const [order] = await this.db.query('SELECT * FROM "Order" WHERE id=$1', [orderId]);
    const path = process.env.P5_STRIPE_FIXTURE_FILE!;
    const state = JSON.parse(readFileSync(path, 'utf8'));
    state[order.stripeCheckoutSessionId].status = 'complete';
    state[order.stripeCheckoutSessionId].payment_status = 'paid';
    writeFileSync(path, JSON.stringify(state));
    const eventId = await this.webhook('checkout.session.completed', order.stripeCheckoutSessionId);
    const [enrollment] = await eventually(() => this.db.query('SELECT * FROM "Enrollment" WHERE "courseId"=$1 AND "userId"=$2', [this.courseId, this.learner.id]), r => r.length === 1);
    const [payment] = await this.db.query('SELECT * FROM "Payment" WHERE "orderId"=$1', [orderId]);
    const [item] = await this.db.query('SELECT * FROM "OrderItem" WHERE "orderId"=$1', [orderId]);
    return { order, orderId, item, payment, enrollment, eventId };
  }
  async start(enrollmentId: string, assessmentId = this.quizId) {
    const r = await this.learner.client.post(`/me/enrollments/${enrollmentId}/assessments/${assessmentId}/attempts`, {}, { idempotencyKey: randomUUID() });
    if (r.status !== 201) throw new Error(`Attempt ${r.status}: ${r.rawText}`);
    return r.data.data;
  }
  async close() { await this.db.disconnect(); }
}
