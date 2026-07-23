import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CallsModule } from './calls/calls.module';
import { OntologyModule } from './ontology/ontology.module';
import { AdminModule } from './admin/admin.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { SchemaModule } from './schema/schema.module';
import { ConfigModule as HcafConfigModule } from './config/config.module';
import { AppInfoModule } from './app.controller';
import { SocketIoModule } from './realtime/socket-io.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
    }),
    SocketIoModule,
    AppInfoModule,
    OntologyModule,
    CallsModule,
    AdminModule,
    HcafConfigModule,
    WorkflowsModule,
    SchemaModule,
  ],
})
export class AppModule {}
