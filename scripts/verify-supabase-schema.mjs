import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

try {
  const [tables, enums, migrations] = await Promise.all([
    prisma.$queryRawUnsafe(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'ioc' AND table_type = 'BASE TABLE' ORDER BY table_name",
    ),
    prisma.$queryRawUnsafe(
      "SELECT t.typname AS name FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'ioc' AND t.typtype = 'e' ORDER BY t.typname",
    ),
    prisma.$queryRawUnsafe(
      'SELECT migration_name AS name FROM ioc._prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
    ),
  ]);

  process.stdout.write(JSON.stringify({ tables, enums, migrations }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
