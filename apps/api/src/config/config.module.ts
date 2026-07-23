import { Body, Controller, Get, Inject, Module, Post } from '@nestjs/common';
import { CallsService } from '../calls/calls.service';
import { CallsModule } from '../calls/calls.module';
import {
  broadcastCallQueue,
  broadcastScenarioUpdate,
  buildWorkflowProgress,
} from '../calls/call-broadcast';
import { OntologyService } from '../ontology/ontology.service';
import { OntologyModule } from '../ontology/ontology.module';
import { ELIGIBILITY_WORKFLOW_STEPS } from '../workflows/eligibility-workflow';
import { listDemoEntities } from '../workflows/demo-entities';
import { SocketIoService } from '../realtime/socket-io.service';
import type { Server } from 'socket.io';

interface SurfaceModuleBody {
  callId: string;
  moduleId: string;
}

interface SurfaceEntityBody {
  callId: string;
  entityId: string;
}

interface AddFieldBody {
  callId: string;
  entityKey: string;
  fieldKey: string;
  label: string;
  fieldType?: string;
}

@Controller('v1/config')
export class ConfigController {
  constructor(
    @Inject(CallsService) private readonly calls: CallsService,
    @Inject(OntologyService) private readonly ontology: OntologyService,
    @Inject(SocketIoService) private readonly socketIo: SocketIoService,
  ) {}

  @Get('demo-entities')
  listDemoEntities() {
    return { entities: listDemoEntities() };
  }

  private broadcastSurface(io: Server | undefined, result: ReturnType<CallsService['surfaceModule']>) {
    if (!io || !result.composed) return;
    const stepDef = this.calls.getStepDef(result.scenario);
    const ont = stepDef
      ? this.ontology.extendWithStep(result.callId, stepDef)
      : { ontology: this.ontology.getOntology(result.callId), label: '', isNew: false };

    broadcastScenarioUpdate(io, result.callId, result, ont.ontology.version);
    if (ont.isNew) {
      io.to(result.callId).emit('message', {
        type: 'ontology.updated',
        payload: { version: ont.ontology.version, label: ont.label },
      });
    }
    io.to(result.callId).emit('message', {
      type: 'workflow.progress',
      payload: buildWorkflowProgress(this.calls, result.callId),
    });
    broadcastCallQueue(io, this.calls);
    return ont.ontology.version;
  }

  @Post('surface-module')
  surfaceModule(@Body() body: SurfaceModuleBody) {
    const io = this.socketIo.getServer();
    const result = this.calls.surfaceModule(body.callId, body.moduleId);
    const ontologyVersion = this.broadcastSurface(io, result);
    return { ok: true, ...result, ontologyVersion };
  }

  @Post('surface-entity')
  surfaceEntity(@Body() body: SurfaceEntityBody) {
    const io = this.socketIo.getServer();
    const result = this.calls.surfaceDemoEntity(body.callId, body.entityId);
    const ontologyVersion = this.broadcastSurface(io, result);
    return { ok: true, ...result, ontologyVersion, isNewEntityType: true };
  }

  @Post('ontology/field')
  addField(@Body() body: AddFieldBody) {
    const io = this.socketIo.getServer();
    const { ontology, isNewEntity } = this.ontology.addField(
      body.callId,
      body.entityKey,
      body.fieldKey,
      { type: body.fieldType ?? 'string', label: body.label },
    );
    const patch = this.calls.addEntityField(
      body.callId,
      body.entityKey,
      body.fieldKey,
      body.label,
      body.fieldType,
    );

    if (io) {
      io.to(body.callId).emit('message', {
        type: 'ontology.updated',
        payload: { version: ontology.version, label: `${body.entityKey}.${body.fieldKey}` },
      });
      if (patch.schemaUpdated) {
        io.to(body.callId).emit('message', { type: 'workflow.schema', payload: patch.schema });
      }
      io.to(body.callId).emit('message', {
        type: 'data.patch',
        payload: [{ op: 'replace', path: '', value: patch.state }],
      });
      io.to(body.callId).emit('message', {
        type: 'platform.notice',
        payload: {
          callId: body.callId,
          message: patch.message,
          ontologyVersion: ontology.version,
          schemaVersion: patch.schema.version,
        },
      });
    }

    return {
      ok: true,
      ontology,
      isNewEntity,
      schemaUpdated: patch.schemaUpdated,
      message: patch.message,
      entities: Object.keys(ontology.entities),
      availableModules: ELIGIBILITY_WORKFLOW_STEPS.map((s) => ({ id: s.id, entityKey: s.entityKey })),
    };
  }
}

@Module({
  imports: [CallsModule, OntologyModule],
  controllers: [ConfigController],
})
export class ConfigModule {}
