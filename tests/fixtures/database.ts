export interface DbHelperOptions {
  connectionString?: string;
  isolatedSchema?: string;
}

export class TestDbHelper {
  private client: any;
  private schema?: string;
  private isConnected: boolean = false;

  constructor(options: DbHelperOptions = {}) {
    const defaultUrl =
      process.env.DATABASE_URL ??
      'postgresql://lms:lms_dev_password@localhost:55432/lms?schema=public';

    // Resolve pg from either root or apps/api node_modules
    const pgPath = require.resolve('pg', {
      paths: [process.cwd(), `${process.cwd()}/apps/api`],
    });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Client } = require(pgPath);

    this.client = new Client({
      connectionString: options.connectionString ?? defaultUrl,
    });
    this.schema = options.isolatedSchema;
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
      this.isConnected = true;
      if (this.schema) {
        await this.client.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`);
        await this.client.query(`SET search_path TO "${this.schema}", public`);
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      if (this.schema) {
        await this.client.query(`DROP SCHEMA IF EXISTS "${this.schema}" CASCADE`);
      }
      await this.client.end();
      this.isConnected = false;
    }
  }

  async query<R extends Record<string, any> = any>(sql: string, params: any[] = []): Promise<R[]> {
    await this.connect();
    const res = await this.client.query(sql, params);
    return res.rows;
  }

  async findUserSessions(userId: string): Promise<any[]> {
    return this.query(
      `SELECT id, "userId", "tokenHash", "isRevoked", "revokedAt", "familyExpiresAt", "createdAt" 
       FROM "RefreshSession" 
       WHERE "userId" = $1 
       ORDER BY "createdAt" DESC`,
      [userId],
    );
  }

  async findOutboxEvents(aggregateId: string): Promise<any[]> {
    return this.query(
      `SELECT id, "workspaceId", type, "aggregateType", "aggregateId", status, payload 
       FROM "OutboxEvent" 
       WHERE "aggregateId" = $1 
       ORDER BY "sequence" ASC`,
      [aggregateId],
    );
  }

  async findAuditLogs(entityId: string): Promise<any[]> {
    return this.query(
      `SELECT id, action, "entityType", "entityId", "actorId", metadata 
       FROM "AuditLog" 
       WHERE "entityId" = $1 
       ORDER BY "createdAt" DESC`,
      [entityId],
    );
  }
}
