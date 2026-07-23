import { Controller, Get, Header, Inject, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Controller()
export class AppController {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  root() {
    const operatorConsole = this.config.get('OPERATOR_CONSOLE_URL', 'http://localhost:5173');
    const configTool = this.config.get('CONFIG_TOOL_URL', 'http://localhost:5174');
    const analytics = this.config.get('ANALYTICS_URL', 'http://localhost:5175');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>HCAF Platform API</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Inter, system-ui, sans-serif;
      background: #0f1419;
      color: #e8edf4;
      padding: 40px 24px;
      line-height: 1.6;
    }
    .container { max-width: 720px; margin: 0 auto; }
    h1 { font-size: 1.5rem; margin-bottom: 8px; }
    p { color: #8b9cb3; margin-bottom: 24px; }
    .card {
      background: #1a2332;
      border: 1px solid #2d3a4f;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 16px;
    }
    h2 { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.05em; color: #8b9cb3; margin-bottom: 12px; }
    a {
      color: #3b82f6;
      text-decoration: none;
      display: block;
      padding: 8px 0;
      border-bottom: 1px solid #2d3a4f;
    }
    a:last-child { border-bottom: none; }
    a:hover { color: #60a5fa; }
    .ui-link {
      display: inline-block;
      background: #3b82f6;
      color: #fff !important;
      padding: 10px 20px;
      border-radius: 6px;
      border: none;
      margin-top: 8px;
      font-weight: 500;
    }
    .ui-link:hover { background: #2563eb; color: #fff; }
    code { background: #243044; padding: 2px 6px; border-radius: 4px; font-size: 0.9em; }
  </style>
</head>
<body>
  <div class="container">
    <h1>HCAF Platform API</h1>
    <p>Backend API for the HCAF product-surface platform. JSON endpoints and WebSocket events for operator workflows.</p>

    <div class="card">
      <h2>Product surfaces</h2>
      <a class="ui-link" href="${operatorConsole}" target="_blank">Operator Console →</a>
      <a class="ui-link" href="${configTool}" target="_blank" style="margin-left:8px;background:#6366f1">Config Tooling →</a>
      <a class="ui-link" href="${analytics}" target="_blank" style="margin-left:8px;background:#0d9488">Analytics →</a>
    </div>

    <div class="card">
      <h2>API endpoints (JSON)</h2>
      <a href="/v1/calls">GET /v1/calls</a>
      <a href="/v1/ontology?callId=call-maria">GET /v1/ontology</a>
      <a href="/v1/calls/call-maria/schema">GET /v1/calls/:callId/schema</a>
      <a href="/v1/calls/call-maria/state">GET /v1/calls/:callId/state</a>
      <a href="/v1/analytics/summary">GET /v1/analytics/summary</a>
    </div>
  </div>
</body>
</html>`;
  }
}

@Module({
  controllers: [AppController],
})
export class AppInfoModule {}
