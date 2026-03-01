import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import SwaggerParser from '@apidevtools/swagger-parser';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, '..');
const openApiPath = path.join(workspaceRoot, 'openapi', 'governance.yaml');

const fixtureSchemaPairs = [
  ['schemas/fixtures/ingest-request.json', 'IngestRequest'],
  ['schemas/fixtures/job-submit-request.json', 'JobSubmitRequest'],
  ['schemas/fixtures/job-status-response.json', 'JobStatusResponse'],
];

const openapi = await SwaggerParser.validate(openApiPath);
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

if (!openapi.components || !openapi.components.schemas) {
  throw new Error('OpenAPI components.schemas is missing.');
}

for (const [fixtureRelPath, schemaName] of fixtureSchemaPairs) {
  const schema = openapi.components.schemas[schemaName];
  if (!schema) {
    throw new Error(`Schema "${schemaName}" not found in OpenAPI document.`);
  }

  const fixturePath = path.join(workspaceRoot, fixtureRelPath);
  const raw = fs.readFileSync(fixturePath, 'utf8');
  const fixture = JSON.parse(raw);

  const validate = ajv.compile(schema);
  const valid = validate(fixture);

  if (!valid) {
    const details = JSON.stringify(validate.errors, null, 2);
    throw new Error(`Fixture ${fixtureRelPath} failed schema ${schemaName} validation:\n${details}`);
  }
}

console.log(`OpenAPI validation passed: ${openApiPath}`);
console.log(`Validated fixtures: ${fixtureSchemaPairs.length}`);
