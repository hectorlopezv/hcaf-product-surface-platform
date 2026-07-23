import { Server } from 'socket.io';
import type { CallsService, OperatorActionResult, ScenarioResult } from './calls.service';
import type { OntologyService } from '../ontology/ontology.service';
import { ELIGIBILITY_WORKFLOW_ID, ELIGIBILITY_WORKFLOW_STEPS } from '../workflows/eligibility-workflow';

export function buildWorkflowProgress(calls: CallsService, callId: string) {
  const activeIds = calls.getActiveModules(callId);
  const active = new Set(activeIds);

  const activeModules = activeIds.map((id) => {
    const step = calls.getStepDef(id);
    return { id, title: step?.title ?? id, status: 'active' as const };
  });

  const availableModules = ELIGIBILITY_WORKFLOW_STEPS.filter((s) => !active.has(s.id)).map((s) => ({
    id: s.id,
    title: s.title,
    status: 'available' as const,
  }));

  return {
    callId,
    workflowId: ELIGIBILITY_WORKFLOW_ID,
    mode: 'random',
    activeModules: activeIds,
    modules: [...activeModules, ...availableModules],
  };
}

export function broadcastScenarioUpdate(
  io: Server,
  callId: string,
  result: ScenarioResult,
  ontologyVersion: string,
) {
  io.to(callId).emit('message', { type: 'workflow.schema', payload: result.schema });
  io.to(callId).emit('message', {
    type: 'data.patch',
    payload: [{ op: 'replace', path: '', value: result.state }],
  });
  io.to(callId).emit('message', {
    type: 'platform.notice',
    payload: {
      callId,
      message: result.message,
      ontologyVersion,
      schemaVersion: result.schema.version,
      activeModules: result.activeModules,
      layoutStrategy: result.layoutStrategy,
      composed: result.composed,
    },
  });
}

export function broadcastOperatorActionResult(io: Server, result: OperatorActionResult) {
  const { callId } = result;

  if (result.schemaUpdated) {
    io.to(callId).emit('message', { type: 'workflow.schema', payload: result.schema });
  }

  io.to(callId).emit('message', {
    type: 'data.patch',
    payload: [{ op: 'replace', path: '', value: result.state }],
  });

  io.to(callId).emit('message', {
    type: 'agent.recommendation',
    payload: result.state.agent.latest,
  });

  io.to(callId).emit('message', {
    type: 'platform.notice',
    payload: {
      callId,
      message: result.message,
      schemaVersion: result.schema.version,
    },
  });
}

export function broadcastCallQueue(io: Server, calls: CallsService) {
  const queue = calls.listCalls();
  for (const callId of calls.getCallIds()) {
    io.to(callId).emit('message', { type: 'call.queue', payload: { calls: queue } });
  }
}

export function broadcastWorkflowAdvance(
  io: Server,
  calls: CallsService,
  ontology: OntologyService,
  callId?: string,
): ScenarioResult | null {
  const result = calls.advanceScenario(callId);
  if (!result.composed) return null;

  const stepDef = calls.getStepDef(result.scenario);
  const ont = stepDef
    ? ontology.extendWithStep(result.callId, stepDef)
    : { ontology: ontology.getOntology(result.callId), label: '', isNew: false };

  broadcastScenarioUpdate(io, result.callId, result, ont.ontology.version);

  if (ont.isNew) {
    io.to(result.callId).emit('message', {
      type: 'ontology.updated',
      payload: { version: ont.ontology.version, label: ont.label },
    });
  }

  io.to(result.callId).emit('message', {
    type: 'workflow.progress',
    payload: buildWorkflowProgress(calls, result.callId),
  });

  broadcastCallQueue(io, calls);
  return result;
}

export function broadcastSessionSnapshot(
  io: Server,
  clientId: string,
  calls: CallsService,
  callId: string,
) {
  const client = io.sockets.sockets.get(clientId);
  if (!client) return;

  client.emit('message', { type: 'workflow.schema', payload: calls.getSchema(callId) });
  client.emit('message', {
    type: 'data.patch',
    payload: [{ op: 'replace', path: '', value: calls.getState(callId) }],
  });
  client.emit('message', {
    type: 'workflow.progress',
    payload: buildWorkflowProgress(calls, callId),
  });
  client.emit('message', { type: 'call.queue', payload: { calls: calls.listCalls() } });
}

export function resolveClientCallId(
  client: { id: string; rooms: Set<string> },
  calls: CallsService,
  fallbackCallId: string,
): string {
  const callIds = new Set(calls.getCallIds());
  for (const room of client.rooms) {
    if (room !== client.id && callIds.has(room)) return room;
  }
  return fallbackCallId;
}
