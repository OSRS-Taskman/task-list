import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { TaskList, TaskTier } from '@/types.js';
import fmt from '@/util/formatter.mjs';

const [listName, tierString] = process.argv.slice(2);
const listTiers = tierString.split(',');

const listData: TaskList = {};
for (const tier of listTiers) {
	const tierData: TaskTier = JSON.parse((await readFile(`./tiers/${tier}.json`)).toString());

	listData[tierData.name] = tierData.tasks;
}

await mkdir('./lists').catch((e) => {
	if (e.code !== 'EEXIST') {
		throw e;
	}
});

// @ts-expect-error
await writeFile(`./lists/${listName}.json`, fmt.Serialize(listData));
