import { Injectable } from '@nestjs/common';
import type { Server } from 'socket.io';

@Injectable()
export class SocketIoService {
  private server?: Server;

  setServer(server: Server): void {
    this.server = server;
  }

  getServer(): Server | undefined {
    return this.server;
  }
}
