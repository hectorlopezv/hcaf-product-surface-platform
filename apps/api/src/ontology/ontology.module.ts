import { Controller, Get, Inject, Module, Query } from '@nestjs/common';
import { OntologyService } from './ontology.service';
import { DEFAULT_CALL_ID } from '../calls/patient-seed';

@Controller('v1/ontology')
export class OntologyController {
  constructor(@Inject(OntologyService) private readonly ontology: OntologyService) {}

  @Get()
  getOntology(@Query('callId') callId?: string) {
    return this.ontology.getOntology(callId ?? DEFAULT_CALL_ID);
  }
}

@Module({
  controllers: [OntologyController],
  providers: [OntologyService],
  exports: [OntologyService],
})
export class OntologyModule {}
