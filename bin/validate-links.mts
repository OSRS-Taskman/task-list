/** biome-ignore-all lint/performance/useTopLevelRegex: who gives a fuck bro */
import { hash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { exit } from 'node:process';
import { closest } from 'fastest-levenshtein';
import { Glob } from 'glob';
import type { TaskTier } from '@/types.js';

const WIKI_ORIGIN = 'https://oldschool.runescape.wiki';
const WIKI_API_URL = `${WIKI_ORIGIN}/api.php`;
const IMAGE_SEARCH_BASE_URL =
	'https://oldschool.runescape.wiki/?title=Special%3ASearch&profile=advanced&fulltext=1&ns6=1&search=';
const CACHE_DIR = './.cache/links';
const IMAGE_CONTENT_TYPE_REGEX = /^image\/(png|gif)/;
const HTTP_STATUS_OK = 200;
const WIKI_API_BATCH_SIZE = 50;
const WIKI_TITLE_ALIAS_MAX_DEPTH = 5;

type WikiPage = { missing?: string; invalid?: string; title?: string };
type WikiQuery = {
	pages?: Record<string, WikiPage>;
	normalized?: { from: string; to: string }[];
	redirects?: { from: string; to: string }[];
};

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
for (const link of await validateWikiLinks([...wikiLinks])) {
	hasErrors = true;
	console.error(`- Invalid link: ${link}`);
}

console.log(`Checking ${imageLinks.size} image links...`);
for (const link of imageLinks) {
	if (!(await validateImageLink(link))) {
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

async function markCached(link: string): Promise<void> {
	await writeFile(`${CACHE_DIR}/${cacheKey(link)}`, '');
}

function wikiTitleFromLink(link: string): string | null {
	let url: URL;
	try {
		url = new URL(link);
	} catch {
		return null;
	}

	if (url.origin !== WIKI_ORIGIN) {
		return null;
	}

	const match = url.pathname.match(/^\/w\/(.+)$/);
	if (!match?.[1]) {
		return null;
	}

	return decodeURIComponent(match[1].replaceAll('_', ' '));
}

function existingWikiTitles(query: WikiQuery): Set<string> {
	const existingTitles = new Set<string>();
	for (const page of Object.values(query.pages ?? {})) {
		if (page.missing != null || page.invalid != null || !page.title) {
			continue;
		}
		existingTitles.add(page.title);
	}
	return existingTitles;
}

function wikiTitleAliases(query: WikiQuery): Map<string, string> {
	const titleAliases = new Map<string, string>();
	for (const { from, to } of query.normalized ?? []) {
		titleAliases.set(from, to);
	}
	for (const { from, to } of query.redirects ?? []) {
		titleAliases.set(from, to);
	}
	return titleAliases;
}

function resolveWikiTitle(title: string, titleAliases: Map<string, string>): string {
	let resolved = title;
	for (let depth = 0; depth < WIKI_TITLE_ALIAS_MAX_DEPTH; depth++) {
		const next = titleAliases.get(resolved);
		if (!next) {
			return resolved;
		}
		resolved = next;
	}
	return resolved;
}

async function validateWikiBatch(batch: { link: string; title: string }[]): Promise<string[]> {
	const titles = batch.map(({ title }) => title);
	const url = new URL(WIKI_API_URL);
	url.searchParams.set('action', 'query');
	url.searchParams.set('format', 'json');
	url.searchParams.set('redirects', '1');
	url.searchParams.set('titles', titles.join('|'));

	const res = await fetch(url);
	if (res.status !== HTTP_STATUS_OK) {
		return batch.map(({ link }) => link);
	}

	const data = (await res.json()) as { query?: WikiQuery };
	const query = data.query ?? {};
	const existingTitles = existingWikiTitles(query);
	const titleAliases = wikiTitleAliases(query);
	const invalid: string[] = [];

	for (const { link, title } of batch) {
		const resolved = resolveWikiTitle(title, titleAliases);
		if (existingTitles.has(resolved)) {
			await markCached(link);
			continue;
		}
		invalid.push(link);
	}

	return invalid;
}

async function validateWikiLinks(links: string[]): Promise<string[]> {
	const invalid: string[] = [];
	const pending: { link: string; title: string }[] = [];

	for (const link of links) {
		if (cachedKeys.has(cacheKey(link))) {
			continue;
		}

		const title = wikiTitleFromLink(link);
		if (!title) {
			invalid.push(link);
			continue;
		}

		pending.push({ link, title });
	}

	for (let i = 0; i < pending.length; i += WIKI_API_BATCH_SIZE) {
		invalid.push(...(await validateWikiBatch(pending.slice(i, i + WIKI_API_BATCH_SIZE))));
	}

	return invalid;
}

async function validateImageLink(link: string): Promise<boolean> {
	if (cachedKeys.has(cacheKey(link))) {
		return true;
	}

	const res = await fetch(link, { method: 'HEAD' });
	const contentType = res.headers.get('Content-Type');

	if (res.status !== HTTP_STATUS_OK || !contentType?.match(IMAGE_CONTENT_TYPE_REGEX)) {
		return false;
	}

	await markCached(link);
	return true;
}

async function proposeImageLinkFix(link: string): Promise<string | null> {
	const baseName = link.replace(/^.+?\/\d+px-(.+?)\.\w+$/, '$1');
	const searchTerm = baseName.replaceAll('_', ' ');

	const res = await fetch(`${IMAGE_SEARCH_BASE_URL}${searchTerm}`, { method: 'GET' });
	const body = await res.text();

	const matchedLinks = [...body.matchAll(/<a href="\/w\/File:(.{5,50})\.(?:png|gif)" title=/g)];
	const suggestedLinks = matchedLinks.flatMap((match) => {
		const fileName = match[1];
		return fileName ? [link.replaceAll(baseName, fileName)] : [];
	});
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
