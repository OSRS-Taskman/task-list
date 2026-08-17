import { readFile } from 'node:fs/promises';
import { exit } from 'node:process';
import type { DefinedError, ValidateFunction } from 'ajv';
import { Glob } from 'glob';
import type { TaskList, TaskTier } from '@/types.js';
import ajv from '@/util/ajv.mjs';

// type "casting" is required here for type guards to work
const validateTier = ajv.getSchema('task-tier') as ValidateFunction<TaskTier>;
const validateList = ajv.getSchema('task-list') as ValidateFunction<TaskList>;

const allErrors = new Map<string, DefinedError[]>();

const tierWalker = new Glob('./tiers/*.json', {});
for await (const tierFile of tierWalker) {
	const tierData = JSON.parse((await readFile(tierFile)).toString());
	if (!validateTier(tierData)) {
		allErrors.set(tierFile, validateTier.errors as DefinedError[]);
	}
}

const listWalker = new Glob('./lists/*.json', {});
for await (const listFile of listWalker) {
	const listData = JSON.parse((await readFile(listFile)).toString());
	if (!validateList(listData)) {
		allErrors.set(listFile, validateList.errors as DefinedError[]);
	}
}

if (allErrors.size === 0) {
	exit(0);
}

console.log('# SCHEMA VALIDATION FAILED');

for (const [errorFile, errors] of allErrors) {
	console.log();
	console.log(`${errorFile}:`);

	for (const error of errors) {
		console.log(`- ${error.instancePath} ${error.message}`, error.params);
	}
}

exit(1);
