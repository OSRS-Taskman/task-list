/**
 * A very simple CLI utility for formatting JSON files in place using FracturedJson.
 *
 * Passing `--lint` as the **first** argument will cause the program to act as a very simple
 * linter, not modifying any file and exiting with an error code if any issues were found.
 *
 * Usage: `npx tsx frac.mts [--lint] <file-glob1> [<file-glob2> ...]`
 * Example: `npx tsx frac.mts tasks/*.json`
 */
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Glob } from 'glob';
import fmt from '@/util/formatter.mjs';

const startTime = performance.now();

const fileGlobs = process.argv.slice(2);

let lintOnly = false;
if (fileGlobs[0] === '--lint') {
	fileGlobs.shift();
	lintOnly = true;
}

let fileCount = 0,
	changeCount = 0;

const walker = new Glob(fileGlobs, {});
for await (const file of walker) {
	fileCount++;

	const content = (await readFile(file)).toString();
	const formattedContent = fmt.Reformat(content);

	if (content !== formattedContent) {
		changeCount++;
		if (!lintOnly) {
			await writeFile(file, formattedContent);
		}
	}
}

const totalTime = Math.round(performance.now() - startTime);

let fixMsg = lintOnly ? 'No issues found' : 'No fixes applied';
if (changeCount > 0) {
	fixMsg = lintOnly ? `Found ${changeCount} issue(s)` : `Fixed ${changeCount} file(s)`;
}

console.log(`Checked ${fileCount} files in ${totalTime}ms. ${fixMsg}.`);

if (lintOnly && changeCount > 0) {
	process.exitCode = 1;
}
