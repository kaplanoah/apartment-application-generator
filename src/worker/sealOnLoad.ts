import { sealScope } from './seal';

// Imported first by the worker entry, so it runs before pdf-lib is evaluated.
sealScope(globalThis);
