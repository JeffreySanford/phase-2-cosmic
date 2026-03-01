/* eslint-disable no-restricted-syntax, @typescript-eslint/no-explicit-any, no-await-in-loop, @typescript-eslint/no-unused-vars, no-empty */
import 'zone.js/node';
import { platformServer } from '@angular/platform-server';
import { AppModule } from './app/app.module';
import { ApplicationRef } from '@angular/core';
import { from, of, lastValueFrom } from 'rxjs';
import { switchMap, map, catchError } from 'rxjs/operators';
import { readFile, readdir } from 'fs/promises';
import { join, dirname, basename } from 'path';

const bootstrap = (): Promise<ApplicationRef> => {
	const resolveResources$ = from(import('@angular/core')).pipe(
		switchMap((ngCore: any) => {
			const hasResolver =
				typeof ngCore.resolveComponentResources === 'function' ||
				typeof ngCore['ɵresolveComponentResources'] === 'function';
			if (hasResolver) {
				const findFileByName = async (root: string, name: string): Promise<string | undefined> => {
					const entries = await readdir(root, { withFileTypes: true });
					for (const e of entries) {
						const p = join(root, e.name);
						if (e.isDirectory()) {
							const found = await findFileByName(p, name);
							if (found) return found;
						} else if (e.isFile() && e.name === name) {
							return p;
						}
					}
					return undefined;
				};

				const resolver = async (url: string) => {
					try {
						console.log(`[SSR resolver] resolving resource URL: ${url}`);
					} catch {}
					// Try multiple candidate locations to resolve template/style files
					const candidates: string[] = [];

					// If the url looks absolute-ish (starts with /), try from project root
					if (url.startsWith('/')) {
						candidates.push(join(process.cwd(), url));
					}

					// Try explicit paths relative to frontend src
					candidates.push(join(process.cwd(), 'apps', 'frontend', 'src', url));
					candidates.push(join(process.cwd(), 'apps', 'frontend', 'src', url.replace(/^\.\//, '')));

					// Fallback: try reading as a path relative to project root
					candidates.push(join(process.cwd(), url));

					// If url is relative (./foo) or a plain filename, search the frontend src tree for the basename
					const name = basename(url);
					try {
						const found = await findFileByName(join(process.cwd(), 'apps', 'frontend', 'src'), name);
						if (found) candidates.unshift(found);
					} catch {
						// ignore search failures
					}

					for (const c of candidates) {
						try {
							try {
								console.debug(`[SSR resolver] trying candidate: ${c}`);
							} catch {}
							const txt = await readFile(c, 'utf8');
							try {
								console.debug(`[SSR resolver] found resource at: ${c}`);
							} catch {}
							return txt;
						} catch {
							// try next candidate
						}
					}

					// As a final fallback try fetch (for dev server served assets)
					try {
						console.debug(`[SSR resolver] trying fetch fallback for: ${url}`);
						const origin = process.env['DEV_SERVER_ORIGIN'] || 'http://localhost:4200';
						const fetchUrl = url.startsWith('/')
							? `${origin}${url}`
							: `${origin}/apps/frontend/src/${url.replace(/^\.\//, '')}`;
						const r = await fetch(fetchUrl);
						if (r && r.ok) return await r.text();
					} catch (e) {
						try {
							console.debug(`[SSR resolver] fetch fallback failed for: ${url} - ${String(e)}`);
						} catch {}
					}

					throw new Error(`Could not resolve resource: ${url}`);
				};

				const resolverFn = ngCore.resolveComponentResources || ngCore['ɵresolveComponentResources'];
				try {
					console.log(`[SSR resolver] using resolver fn: ${resolverFn ? 'present' : 'missing'}`);
				} catch {}
				if (resolverFn) {
					return from(resolverFn(resolver)).pipe(map(() => true));
				}
				return of(true);
			}
			return of(true);
		}),
		catchError(() => of(true)),
	);

	const boot$ = resolveResources$.pipe(
		switchMap(() => from(platformServer().bootstrapModule(AppModule))),
		map((mod: any) => mod.injector.get(ApplicationRef)),
	);

	return lastValueFrom(boot$);
};

export default bootstrap;
