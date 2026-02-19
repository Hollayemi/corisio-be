import { Router } from 'express';
import { readdirSync } from 'fs';
import { join, basename } from 'path';

const router = Router();

const routeDir = __dirname;
const currentFile = basename(__filename);

const routeFiles = readdirSync(routeDir).filter(
    (file) =>
        file !== currentFile &&
        (file.endsWith('.js') || file.endsWith('.ts')) &&
        !file.endsWith('.d.ts') &&
        !file.includes('.test.') &&
        !file.includes('.spec.')
);

routeFiles.forEach((file) => {
    try {
        const routeName = file.replace(/\.(js|ts)$/, '');
        const routeModule = require(join(routeDir, routeName));

        if (routeModule.default && typeof routeModule.default === 'function') {
            router.use(routeModule.default);
            console.log(`Loaded route: /${routeName}`);
        } else {
            console.warn(` Route file ${file} does not export a default router`);
        }
    } catch (error) {
        console.error(`Failed to load route ${file}:`, error);
    }
});

export default router;