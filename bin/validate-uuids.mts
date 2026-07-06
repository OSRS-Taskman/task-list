import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { exit } from 'node:process';
import { Glob } from 'glob';
import type { Task, TaskTier } from '@/types.js';
import fmt from '@/util/formatter.mjs';

const flags = process.argv.slice(2);
const shouldGenerate = flags.includes('--generate');

const uuidMap = new Map<string, [string, Task][]>();

const tierWalker = new Glob('./tiers/*.json', {});
for await (const tierFile of tierWalker) {
	const tierData: TaskTier = JSON.parse((await readFile(tierFile)).toString());
	for (const task of tierData.tasks) {
		if (shouldGenerate && (task.id === '' || task.id == null)) {
			task.id = randomUUID();
			console.log(`Generated UUID ${task.id} for task ${task.name}`);
		}

		const uuidTasks = uuidMap.getOrInsert(task.id ?? '', []);
		uuidTasks.push([tierFile, task]);
	}

	if (shouldGenerate) {
		// biome-ignore lint/style/noNonNullAssertion: trust me bro
		await writeFile(tierFile, fmt.Serialize(tierData)!);
	}
}

let hasErrors = false;

const emptyIdTasks = uuidMap.get('') ?? [];
if (emptyIdTasks.length > 0) {
	hasErrors = true;

	console.error('Tasks without an ID found:');
	for (const [file, task] of emptyIdTasks) {
		console.error(`- ${file}: ${task.name}`);
	}
	console.error();
}

uuidMap.delete('');
for (const [uuid, tasks] of uuidMap.entries()) {
	if (tasks.length <= 1) {
		continue;
	}

	console.error(`Duplicate tasks with ID ${uuid}:`);
	for (const [file, task] of tasks) {
		console.error(`- ${file}: ${task.name}`);
	}
}

if (hasErrors) {
	exit(1);
}
