import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { Glob } from 'glob';
import type { TaskTier } from '@/types.js';
import fmt from '@/util/formatter.mjs';

const tierWalker = new Glob('./tiers/*.json', {});
for await (const tierFile of tierWalker) {
	const tierData: TaskTier = JSON.parse((await readFile(tierFile)).toString());
	for (const task of tierData.tasks) {
		if (task.id === '' || task.id == null) {
			task.id = randomUUID();
			console.log(`Generated UUID ${task.id} for task ${task.name}`);
		}
	}

	// biome-ignore lint/style/noNonNullAssertion: trust me bro
	await writeFile(tierFile, fmt.Serialize(tierData)!);
}
