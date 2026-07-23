import { Controller, Get, Module, NotFoundException, Param } from '@nestjs/common';
import { ELIGIBILITY_WORKFLOW_STEPS } from '../workflows/eligibility-workflow';
import { composeEntityPanel } from './schema-composer';

@Controller('v1/schema')
export class SchemaController {
  @Get('compose/:moduleId')
  composePreview(@Param('moduleId') moduleId: string) {
    const step = ELIGIBILITY_WORKFLOW_STEPS.find((s) => s.id === moduleId);
    if (!step) throw new NotFoundException(`Unknown module: ${moduleId}`);

    const entityData = step.state[step.entityKey] as Record<string, unknown>;
    const result = composeEntityPanel({
      entityKey: step.entityKey,
      title: step.title,
      panelId: step.id,
      fields: step.fields,
      entityData,
    });

    return {
      moduleId: step.id,
      title: step.title,
      layoutStrategy: result.layoutStrategy,
      reasoning: result.reasoning,
      schemaNode: result.schemaNode,
    };
  }

  @Get('strategies')
  listStrategies() {
    return {
      advisor: 'rule-based-layout-advisor',
      strategies: [
        'cob-flow', 'progress-dashboard', 'tabular-with-summary', 'timeline-schedule',
        'escalation-split', 'alert-split', 'field-grid',
      ],
    };
  }
}

@Module({
  controllers: [SchemaController],
})
export class SchemaModule {}
