import { hash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { exit } from 'node:process';
import type { ValidateFunction } from 'ajv';
import { Glob } from 'glob';
import type { TaskTier } from '@/types.js';
import ajv from '@/util/ajv.mjs';

const CACHE_DIR = './.cache/links';
const IMAGE_CONTENT_TYPE_REGEX = /^image\/(png|gif)/;
const HTML_CONTENT_TYPE_REGEX = /^text\/html/;

function cacheKey(link: string): string {
	return hash('sha1', link);
}

async function validateLink(link: string, contentTypeRegex: RegExp): Promise<boolean> {
	if (cachedKeys.has(cacheKey(link))) {
		return true;
	}

	const res = await fetch(link, { method: 'HEAD' });
	const contentType = res.headers.get('Content-Type');

	if (res.status !== 200 || !contentType?.match(contentTypeRegex)) {
		return false;
	}

	await writeFile(`${CACHE_DIR}/${cacheKey(link)}`, '');
	return true;
}

// type "casting" is required here for type guards to work
const validateTier = ajv.getSchema(
	'http://osrs-taskman.com/task-tier.schema.json'
) as ValidateFunction<TaskTier>;

// create cache directory if needed
await mkdir(CACHE_DIR, { recursive: true });

const cachedKeys = new Set<string>();

const cacheWalker = new Glob(`${CACHE_DIR}/*`, {});
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

let hasErrors = false;

console.log(`Checking ${wikiLinks.size} wiki links...`);
for (const link of wikiLinks) {
	if (!(await validateLink(link, HTML_CONTENT_TYPE_REGEX))) {
		hasErrors = true;
		console.error(`- Invalid link: ${link}`);
	}
}

console.log(`Checking ${imageLinks.size} image links...`);
for (const link of imageLinks) {
	if (!(await validateLink(link, IMAGE_CONTENT_TYPE_REGEX))) {
		hasErrors = true;
		console.error(`- Invalid link: ${link}`);
	}
}

if (hasErrors) {
	console.error('Invalid links found!');
	exit(1);
}
