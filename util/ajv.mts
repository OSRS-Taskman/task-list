import { readFile } from 'node:fs/promises';
import { Ajv } from 'ajv';
import addFormats from 'ajv-formats';
import { Glob } from 'glob';

// @ts-expect-error: ajv-formats has no types?
const ajv: Ajv = addFormats(new Ajv());

const schemaWalker = new Glob('./schema/*.schema.json', {});

for await (const file of schemaWalker) {
	const schema = JSON.parse((await readFile(file)).toString());
	ajv.addSchema(schema);
}

export default ajv;
