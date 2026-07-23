import { Controller, Get, Inject, Module, Query } from '@nestjs/common';
import { CallsService } from '../calls/calls.service';
import { CallsModule } from '../calls/calls.module';
import { getWorkflowManifest } from './eligibility-workflow';
import { buildWorkflowProgress } from '../calls/call-broadcast';
import { DEFAULT_CALL_ID } from '../calls/patient-seed';

@Controller('v1/workflows')
export class WorkflowsController {
  constructor(@Inject(CallsService) private readonly calls: CallsService) {}

  @Get('eligibility-check')
  getEligibilityWorkflow() {
    return getWorkflowManifest();
  }

  @Get('eligibility-check/progress')
  getEligibilityProgress(@Query('callId') callId?: string) {
    return buildWorkflowProgress(this.calls, callId ?? DEFAULT_CALL_ID);
  }
}

@Module({
  imports: [CallsModule],
  controllers: [WorkflowsController],
})
export class WorkflowsModule {}
