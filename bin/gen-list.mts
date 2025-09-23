import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { exit } from 'node:process';
import type { ValidateFunction } from 'ajv';
import type { TaskList, TaskTier } from '@/types.js';
import ajv from '@/util/ajv.mjs';
import fmt from '@/util/formatter.mjs';

const [listName, tierString] = process.argv.slice(2);
const listTiers = tierString.split(',');

// type "casting" is required here for type guards to work
const validateTier = ajv.getSchema(
	'http://osrs-taskman.com/task-tier.schema.json'
) as ValidateFunction<TaskTier>;

const listData: TaskList = {};
for (const tier of listTiers) {
	const tierData = JSON.parse((await readFile(`./tiers/${tier}.json`)).toString());
	if (!validateTier(tierData)) {
		console.error(`Unable to locate JSON file for tier ${tier}`);
		exit(1);
	}

	listData[tierData.name] = tierData.tasks;
}

await mkdir('./lists');

// @ts-expect-error
await writeFile(`./lists/${listName}.json`, fmt.Serialize(listData));
