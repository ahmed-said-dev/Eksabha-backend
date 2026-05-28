import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { chromium, type Browser, type Page } from 'playwright';

import { AppModule } from '../src/app.module';
import { TeamEntity } from '../src/modules/catalog/entities/team.entity';

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
}

async function createBrowserPage(): Promise<{ browser: Browser; page: Page }> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
  });

  await page.goto('https://www.sofascore.com/', { waitUntil: 'domcontentloaded' });
  return { browser, page };
}

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const { browser, page } = await createBrowserPage();

  try {
    const teamRepo = app.get<Repository<TeamEntity>>(getRepositoryToken(TeamEntity));
    const teams = await teamRepo.find({
      where: { tournament: { competitionKey: 'egyptian-premier-league-current' } },
      relations: { tournament: true },
      order: { name: 'ASC' },
    });

    const outputDir = join(process.cwd(), '..', 'assets', 'clubs', 'egyptian-league');
    await mkdir(outputDir, { recursive: true });

    const manifest: Array<{ teamId: string; name: string; logoPath: string | null; flagUrl: string | null }> = [];

    for (const team of teams) {
      if (!team.flagUrl) {
        manifest.push({ teamId: slugify(team.name), name: team.name, logoPath: null, flagUrl: null });
        continue;
      }

      const result = await page.evaluate(async (url) => {
        try {
          const response = await fetch(url, {
            headers: {
              Accept: 'image/webp,image/png,image/*,*/*;q=0.8',
            },
          });

          const bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
          return {
            ok: response.ok,
            status: response.status,
            contentType: response.headers.get('content-type'),
            bytes,
          };
        } catch (error) {
          return {
            ok: false,
            status: 0,
            contentType: null,
            bytes: [],
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }, team.flagUrl);

      if (!result.ok || result.bytes.length === 0) {
        manifest.push({ teamId: slugify(team.name), name: team.name, logoPath: null, flagUrl: team.flagUrl });
        continue;
      }

      const bytes = Buffer.from(result.bytes);
      const extension = result.contentType?.includes('png') ? 'png' : 'webp';
      const fileName = `${slugify(team.name)}.${extension}`;
      const filePath = join(outputDir, fileName);
      await writeFile(filePath, bytes);

      manifest.push({
        teamId: slugify(team.name),
        name: team.name,
        logoPath: `assets/clubs/egyptian-league/${fileName}`,
        flagUrl: team.flagUrl,
      });
    }

    await writeFile(join(outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
  } finally {
    await browser.close();
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
