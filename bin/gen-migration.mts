// just pretend you never saw this file; quick, close it! now!

import { readFileSync } from 'node:fs';
import { flat, group, mapKeys } from 'radash';
import type { TaskTier } from '@/types.js';
import fmt from '@/util/formatter.mjs';

const EXTRA_TASK_MAPPING = {
	'a large water container': 'a heat-proof vessel',
	'1 fortis colosseum unique': '1 unique from fortis colosseum',
	'3 new uniques from easy clues': '3 uniques from easy clues',
	'3 new uniques from medium clues': '3 uniques from medium clues',
	'3 new uniques from hard clues': '3 uniques from hard clues',
	'1 minigame log slot': '1 minigame slot',
	'1 boss pet or jar': '1 unique boss pet or jar',
	'a new level 99': 'a level 99',
	'a unique from creature creation': '1 unique from creature creation',
	'master tier combat achievements': 'complete easy/medium/hard/elite/+50 points',
	'1 unique from the dt2 bosses': '1 unique from dt2 bosses',
	'obtain the quetzin': 'quetzin',
	'1 skilling pet': '1 unique skilling pet',
	'2 lms log slots': '2 lms slots',
	'infernal cape': 'a infernal cape',
	'upgrade to the (expert) dragon archer headpiece':
		'upgrade to the expert dragon archer headpiece',
};

function processTaskName(taskName: string): string {
	// biome-ignore lint: because
	return taskName.toLowerCase().replace(/^get /, '');
}

const inFile = process.argv[2];

const offMaster = JSON.parse(readFileSync('./tiers/master.json').toString()) as TaskTier;
const tedMaster = JSON.parse(readFileSync('./tiers/master-tedious.json').toString()) as TaskTier;

offMaster.tasks = offMaster.tasks.map((t) => ({ ...t, name: processTaskName(t.name) }));
tedMaster.tasks = tedMaster.tasks.map((t) => ({ ...t, name: processTaskName(t.name) }));

const taskNameGroups = group(offMaster.tasks, (t) => t.name);
const taskMigrationMap: Record<string, string | null> = {};

for (const tedTask of tedMaster.tasks) {
	// biome-ignore lint: because
	// @ts-ignore
	const matchingId = shiftTask(tedTask.name);
	taskMigrationMap[tedTask.id] = matchingId;

	if (matchingId === null) {
		// console.log(`Couldn't find match for task with name ${tedTask.name}`);
	}
}

function shiftTask(taskName: string): string | null {
	// biome-ignore lint: because
	// @ts-ignore
	const tasks = taskNameGroups[taskName] ?? taskNameGroups[EXTRA_TASK_MAPPING[taskName]];

	if (!tasks || tasks.length === 0) {
		return null;
	}

	return tasks.shift()?.id ?? null;
}

console.log(fmt.Serialize(taskMigrationMap));
