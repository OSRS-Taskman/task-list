/** biome-ignore-all lint/performance/useTopLevelRegex: who gives a fuck bro */
import { hash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { exit } from 'node:process';
import { closest } from 'fastest-levenshtein';
import { Glob } from 'glob';
import type { TaskTier } from '@/types.js';

const IMAGE_SEARCH_BASE_URL =
	'https://oldschool.runescape.wiki/?title=Special%3ASearch&profile=advanced&fulltext=1&ns6=1&search=';
const CACHE_DIR = './.cache/links';
const IMAGE_CONTENT_TYPE_REGEX = /^image\/(png|gif)/;
const HTML_CONTENT_TYPE_REGEX = /^text\/html/;
const HTTP_STATUS_OK = 200;

const shouldFix = process.argv.slice(2).includes('--fix');

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
	const tierData: TaskTier = JSON.parse((await readFile(tierFile)).toString());

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
		console.error(`- Invalid link: ${link}`);

		if (shouldFix) {
			const fixedLink = await proposeImageLinkFix(link);
			if (fixedLink) {
				replaceLink(link, fixedLink);
				console.log(`Fixed with: ${fixedLink}`);
				continue;
			}
		}

		hasErrors = true;
	}
}

if (hasErrors) {
	console.error('Invalid links found!');
	exit(1);
}

function cacheKey(link: string): string {
	return hash('sha1', link);
}

async function validateLink(link: string, contentTypeRegex: RegExp): Promise<boolean> {
	if (cachedKeys.has(cacheKey(link))) {
		return true;
	}

	const res = await fetch(link, { method: 'HEAD' });
	const contentType = res.headers.get('Content-Type');

	if (res.status !== HTTP_STATUS_OK || !contentType?.match(contentTypeRegex)) {
		return false;
	}

	await writeFile(`${CACHE_DIR}/${cacheKey(link)}`, '');
	return true;
}

async function proposeImageLinkFix(link: string): Promise<string | null> {
	const baseName = link.replace(/^.+?\/\d+px-(.+?)\.\w+$/, '$1');
	const searchTerm = baseName.replaceAll('_', ' ');

	const res = await fetch(`${IMAGE_SEARCH_BASE_URL}${searchTerm}`, { method: 'GET' });
	const body = await res.text();

	const matchedLinks = [...body.matchAll(/<a href="\/w\/File:(.{5,50})\.(?:png|gif)" title=/g)];
	const suggestedLinks = matchedLinks.map((match) => link.replaceAll(baseName, match[1]));
	if (suggestedLinks.length === 0) {
		return null;
	}

	return closest(link, suggestedLinks);
}

async function replaceLink(oldLink: string, newLink: string) {
	for await (const tierFile of tierWalker) {
		const tierText = (await readFile(tierFile)).toString();

		await writeFile(tierFile, tierText.replaceAll(oldLink, newLink));
	}
}
