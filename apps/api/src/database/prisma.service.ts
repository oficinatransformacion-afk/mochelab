import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { postgresOptions } from "./postgres-options";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  readonly configured: boolean;

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    const connectionString = databaseUrl ?? "postgresql://mochelab:mochelab@localhost:5432/mochelab";
    super({ adapter: new PrismaPg(databaseUrl ? postgresOptions(connectionString) : { connectionString }) });
    this.configured = Boolean(databaseUrl);
  }

  async onModuleInit(): Promise<void> {
    if (!this.configured) {
      this.logger.warn("DATABASE_URL no configurada; la API inicia sin persistencia");
      return;
    }
    await this.$connect();
    this.logger.log("Conexión PostgreSQL iniciada");
  }

  async onModuleDestroy(): Promise<void> {
    if (this.configured) await this.$disconnect();
  }

  requireConnection(): void {
    if (!this.configured) {
      throw new ServiceUnavailableException("La base de datos aún no está configurada");
    }
  }
}
