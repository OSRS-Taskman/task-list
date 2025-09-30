import { hash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { exit } from 'node:process';
import type { ValidateFunction } from 'ajv';
import CLIProgress from 'cli-progress';
import { Glob } from 'glob';
import runParallelLimit from 'run-parallel-limit';
import type { TaskTier } from '@/types.js';
import ajv from '@/util/ajv.mjs';

const IMAGE_CONTENT_TYPE_REGEX = /^image\/(png|gif)/;

function cacheKey(link: string): string {
	return hash('sha1', link);
}

const progressBar = new CLIProgress.SingleBar({}, CLIProgress.Presets.shades_grey);

// type "casting" is required here for type guards to work
const validateTier = ajv.getSchema(
	'http://osrs-taskman.com/task-tier.schema.json'
) as ValidateFunction<TaskTier>;

// create cache directory if needed
await mkdir('./.cache/links', { recursive: true });

const cachedKeys = new Set<string>();

const cacheWalker = new Glob('./.cache/links/*', {});
for await (const cacheFile of cacheWalker) {
	cachedKeys.add(basename(cacheFile));
}

console.log(`Found ${cachedKeys.size} cached links!`);

const wikiLinks = new Set<string>();
const imageLinks = new Set<string>();

const tierWalker = new Glob('./tiers/*.json', {});
for await (const tierFile of tierWalker) {
	const tierData = JSON.parse((await readFile(tierFile)).toString());
	if (!validateTier(tierData)) {
		console.error(`File ${tierFile} does not match schema`);
		exit(1);
	}

	for (const task of tierData.tasks) {
		wikiLinks.add(task.wikiLink);
		imageLinks.add(task.imageLink);
	}
}

const wikiTasks = wikiLinks
	.values()
	.filter((link) => !cachedKeys.has(cacheKey(link)))
	.map((link) => async (cb: (err: Error | null, results: string | null) => void) => {
		const res = await fetch(link, { method: 'HEAD' });
		const contentType = res.headers.get('Content-Type');

		progressBar.increment();
		if (res.status !== 200 || !contentType?.startsWith('text/html')) {
			console.log(res);
			return cb(null, link);
		}

		await writeFile(`./.cache/links/${cacheKey(link)}`, '');
		return cb(null, null);
	});

const imageTasks = imageLinks
	.values()
	.filter((link) => !cachedKeys.has(cacheKey(link)))
	.map((link) => async (cb: (err: Error | null, results: string | null) => void) => {
		const res = await fetch(link, { method: 'HEAD' });
		const contentType = res.headers.get('Content-Type');

		progressBar.increment();
		if (res.status !== 200 || !contentType?.match(IMAGE_CONTENT_TYPE_REGEX)) {
			console.log(res);
			return cb(null, link);
		}

		await writeFile(`./.cache/links/${cacheKey(link)}`, '');
		return cb(null, null);
	});

const allTasks = [...wikiTasks, ...imageTasks];

console.log(`Checking ${allTasks.length} links...`);
progressBar.start(allTasks.length, 0);

runParallelLimit(allTasks, 1, (_, res) => {
	progressBar.stop();

	const invalidLinks = res.filter(Boolean) as string[];
	if (invalidLinks.length > 0) {
		console.error();
		console.error(`${invalidLinks.length} invalid links found:`);
		for (const link of invalidLinks) {
			console.error(`- ${link}`);
		}

		exit(1);
	}
});
