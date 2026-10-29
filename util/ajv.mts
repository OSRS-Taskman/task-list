import { readFile } from 'node:fs/promises';
import Ajv from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import { Glob } from 'glob';

const ajv: Ajv = addFormats(new Ajv());

const schemaWalker = new Glob('./schema/*.schema.json', {});
for await (const file of schemaWalker) {
	const schema = JSON.parse((await readFile(file)).toString());
	ajv.addSchema(schema);
}

export default ajv;
