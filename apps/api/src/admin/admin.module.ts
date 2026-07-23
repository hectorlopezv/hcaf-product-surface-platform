import { Controller, Inject, Module, Post, Query } from '@nestjs/common';
import { CallsService } from '../calls/calls.service';
import { OntologyService } from '../ontology/ontology.service';
import { CallsModule } from '../calls/calls.module';
import { OntologyModule } from '../ontology/ontology.module';
import { broadcastCallQueue, broadcastScenarioUpdate, broadcastWorkflowAdvance } from '../calls/call-broadcast';
import { DEFAULT_CALL_ID } from '../calls/patient-seed';
import { SocketIoService } from '../realtime/socket-io.service';

@Controller('v1/admin')
export class AdminController {
  constructor(
    @Inject(CallsService) private readonly calls: CallsService,
    @Inject(OntologyService) private readonly ontology: OntologyService,
    @Inject(SocketIoService) private readonly socketIo: SocketIoService,
  ) {}

  @Post('advance-scenario')
  advanceScenario(@Query('callId') callId?: string) {
    const io = this.socketIo.getServer();
    if (!io) return { ok: false };
    const result = broadcastWorkflowAdvance(io, this.calls, this.ontology, callId);
    if (!result) return { ok: true, skipped: true, reason: 'awaiting operator decision' };
    return { ok: true, ...result };
  }

  @Post('reset')
  reset(@Query('callId') callId?: string) {
    const target = callId ?? DEFAULT_CALL_ID;
    this.ontology.reset(target);
    const result = this.calls.resetDemo(target);
    const io = this.socketIo.getServer();
    if (io) {
      broadcastScenarioUpdate(io, target, result, '1.0.0');
      io.to(target).emit('message', {
        type: 'ontology.updated',
        payload: { version: '1.0.0', label: 'Base' },
      });
      broadcastCallQueue(io, this.calls);
    }
    return { ok: true, ...result };
  }
}

@Module({
  imports: [CallsModule, OntologyModule],
  controllers: [AdminController],
})
export class AdminModule {}
