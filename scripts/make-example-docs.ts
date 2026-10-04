/** Writes the fake "Apartment Docs" example folder used in the README. */
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { sampleFolderFiles, writeFiles } from './lib/sampleDocs.ts';

const target = fileURLToPath(new URL('../example/Apartment Docs', import.meta.url));
await rm(target, { recursive: true, force: true });
const files = await sampleFolderFiles();
await writeFiles(target, files);
console.log(`Wrote ${files.size} sample files to ${target}`);
