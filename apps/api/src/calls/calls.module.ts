import { Controller, Get, Inject, Module, Param } from '@nestjs/common';
import { CallsService } from './calls.service';

@Controller('v1/calls')
export class CallsController {
  constructor(@Inject(CallsService) private readonly calls: CallsService) {}

  @Get()
  listCalls() {
    return { calls: this.calls.listCalls() };
  }

  @Get(':callId/schema')
  getSchema(@Param('callId') callId: string) {
    return this.calls.getSchema(callId);
  }

  @Get(':callId/state')
  getState(@Param('callId') callId: string) {
    return this.calls.getState(callId);
  }
}

@Controller('v1/analytics')
export class AnalyticsController {
  constructor(@Inject(CallsService) private readonly calls: CallsService) {}

  @Get('summary')
  getSummary() {
    return this.calls.getAnalyticsSummary();
  }
}

@Module({
  controllers: [CallsController, AnalyticsController],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
