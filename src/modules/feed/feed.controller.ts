import { Body, Controller, Get, Headers, Param, Post, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AdminGuard } from '../player-admin/guards/admin.guard';
import { FeedPayloadQueryDto } from './dto/feed-payload-query.dto';
import { FeedSyncAdminDto } from './dto/feed-sync-admin.dto';
import { IngestFeedPayloadDto } from './dto/ingest-feed-payload.dto';
import { ProviderMappingQueryDto } from './dto/provider-mapping-query.dto';
import { SofaFixtureScrapeAdminDto } from './dto/sofa-fixture-scrape-admin.dto';
import { SofaTeamPlayersScrapeAdminDto } from './dto/sofa-team-players-scrape-admin.dto';
import { FeedProcessingStatus } from './entities/raw-feed-payload.entity';
import { FeedService } from './feed.service';

@Controller('feed')
export class FeedController {
  constructor(
    private readonly feedService: FeedService,
    private readonly configService: ConfigService,
  ) {}

  @Get('status')
  getFeedStatus() {
    return this.feedService.getStatus();
  }

  @Get('payloads')
  getPayloads(@Query('status') status?: FeedProcessingStatus) {
    return this.feedService.getPayloads(status);
  }

  @Get('admin/overview')
  @UseGuards(AdminGuard)
  getFeedOverview(@Query('tournamentId') tournamentId?: string) {
    return this.feedService.getAdminOverview(tournamentId);
  }

  @Get('admin/payloads')
  @UseGuards(AdminGuard)
  getAdminPayloads(@Query() query: FeedPayloadQueryDto) {
    return this.feedService.getAdminPayloads(query);
  }

  @Get('admin/providers/status')
  @UseGuards(AdminGuard)
  getProviderStatus() {
    return this.feedService.getProviderStatus();
  }

  @Get('admin/provider-mappings')
  @UseGuards(AdminGuard)
  getProviderMappings(@Query() query: ProviderMappingQueryDto) {
    return this.feedService.getProviderMappings(query.tournamentId);
  }

  @Post('admin/sync')
  @UseGuards(AdminGuard)
  triggerAdminSync(@Body() dto: FeedSyncAdminDto) {
    return this.feedService.triggerAdminSync(dto);
  }

  @Post('admin/results/fixtures/:fixtureId/sync')
  @UseGuards(AdminGuard)
  triggerAdminFixtureResultSync(
    @Param('fixtureId') fixtureId: string,
    @Body() dto: FeedSyncAdminDto,
  ) {
    return this.feedService.triggerAdminFixtureResultSync(fixtureId, dto);
  }

  @Post('admin/results/matchdays/:matchdayId/sync')
  @UseGuards(AdminGuard)
  triggerAdminMatchdayResultSync(
    @Param('matchdayId') matchdayId: string,
    @Body() dto: FeedSyncAdminDto,
  ) {
    return this.feedService.triggerAdminMatchdayResultSync(matchdayId, dto);
  }

  @Post('admin/scrape/live')
  @UseGuards(AdminGuard)
  triggerAdminLiveScrape(@Body() dto: FeedSyncAdminDto) {
    return this.feedService.triggerAdminLiveScrape(dto);
  }

  @Post('admin/scrape/fixtures/:fixtureId')
  @UseGuards(AdminGuard)
  triggerAdminFixtureScrape(
    @Param('fixtureId') fixtureId: string,
    @Body() dto: FeedSyncAdminDto,
  ) {
    return this.feedService.triggerAdminFixtureScrape(fixtureId, dto);
  }

  @Post('admin/scrape/sofascore')
  @UseGuards(AdminGuard)
  triggerAdminSofaScoreFixtureScrape(@Body() dto: SofaFixtureScrapeAdminDto) {
    return this.feedService.triggerAdminSofaScoreFixtureScrape(dto);
  }

  @Post('admin/scrape/sofascore/players')
  @UseGuards(AdminGuard)
  triggerAdminSofaScoreTeamPlayersScrape(@Body() dto: SofaTeamPlayersScrapeAdminDto) {
    return this.feedService.triggerAdminSofaScoreTeamPlayersScrape(dto);
  }

  @Post('admin/scrape/matchdays/:matchdayId')
  @UseGuards(AdminGuard)
  triggerAdminMatchdayScrape(
    @Param('matchdayId') matchdayId: string,
    @Body() dto: FeedSyncAdminDto,
  ) {
    return this.feedService.triggerAdminMatchdayScrape(matchdayId, dto);
  }

  @Post('payloads')
  ingestPayload(@Body() dto: IngestFeedPayloadDto) {
    return this.feedService.ingestPayload(dto);
  }

  @Post('payloads/:payloadId/process')
  processPayload(@Param('payloadId') payloadId: string) {
    return this.feedService.processPayload(payloadId);
  }

  @Post('sync/api-football/world-cup')
  syncApiFootballWorldCup(@Headers('x-feed-sync-secret') syncSecret?: string) {
    const configuredSecret = this.configService.get<string>('EXTERNAL_FEED_SYNC_SECRET');
    if (configuredSecret && configuredSecret !== syncSecret) {
      throw new UnauthorizedException('Invalid feed sync secret.');
    }
    return this.feedService.syncApiFootballWorldCup();
  }

  @Post('sync/api-football/all-tournaments')
  syncAllTournaments(@Headers('x-feed-sync-secret') syncSecret?: string) {
    const configuredSecret = this.configService.get<string>('EXTERNAL_FEED_SYNC_SECRET');
    if (configuredSecret && configuredSecret !== syncSecret) {
      throw new UnauthorizedException('Invalid feed sync secret.');
    }
    return this.feedService.syncAllTournaments();
  }

  @Post('sync/tournaments/:tournamentId')
  syncTournamentById(
    @Param('tournamentId') tournamentId: string,
    @Headers('x-feed-sync-secret') syncSecret?: string,
  ) {
    const configuredSecret = this.configService.get<string>('EXTERNAL_FEED_SYNC_SECRET');
    if (configuredSecret && configuredSecret !== syncSecret) {
      throw new UnauthorizedException('Invalid feed sync secret.');
    }
    return this.feedService.syncTournamentById(tournamentId);
  }

  @Post('sync/api-football/world-cup/fixtures/:fixtureId/events')
  syncApiFootballFixtureEvents(
    @Param('fixtureId') fixtureId: string,
    @Headers('x-feed-sync-secret') syncSecret?: string,
  ) {
    const configuredSecret = this.configService.get<string>('EXTERNAL_FEED_SYNC_SECRET');
    if (configuredSecret && configuredSecret !== syncSecret) {
      throw new UnauthorizedException('Invalid feed sync secret.');
    }
    return this.feedService.ingestApiFootballFixtureEvents(fixtureId);
  }
}
