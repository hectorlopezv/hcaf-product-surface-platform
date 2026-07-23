import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Server } from 'socket.io';
import { AppModule } from './app.module';
import { CallsService } from './calls/calls.service';
import {
  broadcastWorkflowAdvance,
  broadcastSessionSnapshot,
  broadcastOperatorActionResult,
  resolveClientCallId,
  broadcastCallQueue,
} from './calls/call-broadcast';
import { OntologyService } from './ontology/ontology.service';
import { SocketIoService } from './realtime/socket-io.service';

function envInt(config: ConfigService, key: string, fallback: number): number {
  const raw = config.get<string>(key);
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const corsOrigin = config.get<string>('CORS_ORIGIN', '*');

  app.enableCors({ origin: corsOrigin === '*' ? true : corsOrigin.split(',') });

  const calls = app.get(CallsService);
  const ontology = app.get(OntologyService);
  const socketIo = app.get(SocketIoService);
  const httpServer = app.getHttpServer();
  const io = new Server(httpServer, { cors: { origin: corsOrigin } });
  socketIo.setServer(io);

  const liveDataIntervalMs = envInt(config, 'LIVE_DATA_INTERVAL_MS', 3000);
  const workflowIntervalMs = envInt(config, 'WORKFLOW_INTERVAL_MS', 7000);
  const staggerBaseMs = envInt(config, 'WORKFLOW_STAGGER_BASE_MS', 1500);
  const staggerStepMs = envInt(config, 'WORKFLOW_STAGGER_STEP_MS', 900);

  let tick = 0;
  const liveDataInterval = setInterval(() => {
    tick += 1;
    for (const callId of calls.getCallIds()) {
      const state = calls.getState(callId);
      const rows = structuredClone(state.eligibility.rows);
      if (rows[1]) rows[1] = { ...rows[1], status: tick % 4 === 0 ? 'active' : 'pending' };
      calls.patchState(callId, 'eligibility.rows', rows);
      io.to(callId).emit('message', {
        type: 'data.patch',
        payload: [{ op: 'replace', path: '/eligibility/rows', value: rows }],
      });
    }
  }, liveDataIntervalMs);

  const workflowInterval = setInterval(() => {
    for (const id of calls.getCallIds()) {
      broadcastWorkflowAdvance(io, calls, ontology, id);
    }
  }, workflowIntervalMs);

  for (const [index, id] of calls.getCallIds().entries()) {
    setTimeout(() => broadcastWorkflowAdvance(io, calls, ontology, id), staggerBaseMs + index * staggerStepMs);
  }

  io.on('connection', (client) => {
    const callId = (client.handshake.query.callId as string) || calls.getCallIds()[0];
    client.join(callId);
    broadcastSessionSnapshot(io, client.id, calls, callId);
    client.emit('message', {
      type: 'platform.notice',
      payload: {
        callId,
        message: 'Call connected — workflow modules surface automatically as blockers are detected.',
        activeModules: calls.getActiveModules(callId),
      },
    });

    client.on('operator.action', (body: { action: string; feedback?: string }) => {
      const activeCallId = resolveClientCallId(client, calls, callId);
      const pending = calls.getState(activeCallId).agent.latest;
      if (pending.status === 'pending') {
        io.to(activeCallId).emit('message', {
          type: 'data.patch',
          payload: [{ op: 'replace', path: '/agent/latest', value: { ...pending, status: 'executing' } }],
        });
      }
      const result = calls.handleOperatorAction(activeCallId, body.action, body.feedback);
      if (result.patches.length === 0) {
        io.to(activeCallId).emit('message', {
          type: 'platform.notice',
          payload: { callId: activeCallId, message: result.message },
        });
        return;
      }
      if (body.action === 'override' && result.state.agent.feedbackLog?.length) {
        const latest = result.state.agent.feedbackLog.at(-1);
        console.log(`[operator.feedback] call=${activeCallId}`, latest);
      }
      broadcastOperatorActionResult(io, result);
      broadcastCallQueue(io, calls);
      setTimeout(() => broadcastWorkflowAdvance(io, calls, ontology, activeCallId), 3000);
    });

    client.on('call.switch', (body: { callId: string }) => {
      if (!body?.callId || !calls.getCallIds().includes(body.callId)) return;
      for (const room of client.rooms) {
        if (room !== client.id && calls.getCallIds().includes(room)) client.leave(room);
      }
      client.join(body.callId);
      broadcastSessionSnapshot(io, client.id, calls, body.callId);
    });
  });

  const port = envInt(config, 'PORT', 3001);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
  console.log(`Active calls: ${calls.getCallIds().join(', ')}`);

  process.on('SIGTERM', () => {
    clearInterval(liveDataInterval);
    clearInterval(workflowInterval);
  });
}

bootstrap();
