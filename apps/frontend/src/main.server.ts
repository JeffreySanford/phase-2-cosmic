/* eslint-disable no-restricted-syntax, @typescript-eslint/no-explicit-any, no-await-in-loop, @typescript-eslint/no-unused-vars, no-empty */
import 'zone.js/node';
import { platformServer } from '@angular/platform-server';
import { AppModule } from './app/app.module';
import { ApplicationRef } from '@angular/core';
import { from, of, lastValueFrom } from 'rxjs';
import { switchMap, map, catchError } from 'rxjs/operators';
import { readFile, readdir } from 'fs/promises';
import { join, dirname, basename } from 'path';

const bootstrap = async (): Promise<ApplicationRef> => {
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
		const candidates: string[] = [];
		if (url.startsWith('/')) {
			candidates.push(join(process.cwd(), url));
		}
		candidates.push(join(process.cwd(), 'apps', 'frontend', 'src', url));
		candidates.push(join(process.cwd(), 'apps', 'frontend', 'src', url.replace(/^\.\//, '')));
		candidates.push(join(process.cwd(), url));

		const name = basename(url);
		try {
			const found = await findFileByName(process.cwd(), name);
			if (found) candidates.unshift(found);
		} catch {}

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
				// next
			}
		}

		try {
			console.debug(`[SSR resolver] trying fetch fallback for: ${url}`);
			const origin = process.env['DEV_SERVER_ORIGIN'] || 'http://localhost:4200';
			const fetchUrl = url.startsWith('/') ? `${origin}${url}` : `${origin}/apps/frontend/src/${url.replace(/^\.\//, '')}`;
			const r = await fetch(fetchUrl);
			if (r && r.ok) return await r.text();
		} catch (e) {
			try {
				console.debug(`[SSR resolver] fetch fallback failed for: ${url} - ${String(e)}`);
			} catch {}
		}

		throw new Error(`Could not resolve resource: ${url}`);
	};

	try {
		const ngCore: any = await import('@angular/core');
		const resolverFn = ngCore.resolveComponentResources || ngCore['ɵresolveComponentResources'];
		console.log(`[SSR resolver] using resolver fn: ${resolverFn ? 'present' : 'missing'}`);
		if (resolverFn) {
			await resolverFn(resolver);
			console.log('[SSR resolver] resolveComponentResources completed');
		}
	} catch (e) {
		console.warn('SSR resolver setup failed:', e);
	}

	const mod = await platformServer().bootstrapModule(AppModule);
	return mod.injector.get(ApplicationRef);
};

export default bootstrap;
