import { writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { compileFromFile } from 'json-schema-to-typescript';
import { pascal } from 'radash';

const file = './schema/root.schema.json';
const typeContent = await compileFromFile(file, {
	customName: (type) => {
		if (type.tsEnumNames) {
			type.tsEnumNames = type.tsEnumNames.map((v) => pascal(v));
		}

		return type?.$id ? pascal(basename(type.$id, '.schema.json')) : undefined;
	},
	inferStringEnumKeysFromValues: true,
	unreachableDefinitions: true,
	style: {
		useTabs: true,
		singleQuote: true,
	},
});

writeFile('types.d.ts', typeContent);
