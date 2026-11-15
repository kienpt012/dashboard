import { PrismaClient } from '@prisma/client';
import { SYSTEM_ACTOR } from '../access';
import { trainForecast } from './service';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Cần DATABASE_URL trỏ tới CSDL được phép huấn luyện');
  const prisma = new PrismaClient();
  try {
    const model = await trainForecast(prisma, SYSTEM_ACTOR);
    console.log(JSON.stringify({ id: model.id, trained: model.trained, sourceLabel: model.sourceLabel, samples: model.sampleCount, trainSamples: model.trainSamples, testSamples: model.testSamples, metrics: model.metrics, fallbackReason: model.fallbackReason, evaluationLabel: model.evaluationLabel }, null, 2));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
