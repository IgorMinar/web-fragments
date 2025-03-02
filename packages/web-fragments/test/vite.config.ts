import { defineConfig, ViteDevServer, PreviewServer } from 'vite';
import { glob } from 'glob';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { FragmentGateway } from '../src/gateway';
import { getNodeMiddleware } from '../src/gateway/middleware/node';

export default defineConfig({
	appType: 'mpa',
	resolve: {
		alias: {
			// cross-repo development only!
			// requires writable-dom checked out as a sibling to `reframed`
			//'writable-dom': new URL('../../../writable-dom/src/index.ts', import.meta.url).pathname,
			'web-fragments/elements': new URL('../src/elements/', import.meta.url).pathname,
		},
	},
	build: {
		outDir: 'dist',
		emptyOutDir: true,
		rollupOptions: {
			input:
				// create an input map for rollup from all html files in the current directory
				(await glob('**/*.html', { ignore: 'dist/**' })).reduce<Record<string, string>>((config, path) => {
					// the key will become a filename for the js bundle, so escape all / to _
					const scriptName = path.replaceAll('/', '_');
					config[scriptName] = path;
					return config;
				}, {}),
		},
	},

	plugins: [
		{
			name: 'web-fragments-middleware',
			configureServer: configureGatewayMiddleware,
			configurePreviewServer: configureGatewayMiddleware,
		},
	],
});

async function configureGatewayMiddleware(server: ViteDevServer | PreviewServer) {
	let serverUrl: string;

	server.httpServer!.once('listening', () => {
		const addressInfo = server.httpServer!.address()!;

		if (typeof addressInfo === 'string') {
			serverUrl = addressInfo;
			return;
		}

		const protocol = server.config.server.https ? 'https' : 'http';
		const host =
			addressInfo.address === '::' || addressInfo.address === '::1' || addressInfo.address === '0.0.0.0'
				? 'localhost'
				: addressInfo.address;
		const port = addressInfo.port;

		serverUrl = `${protocol}://${host}:${port}`;
	});

	const getServerUrl = () => {
		if (!serverUrl) {
			throw new Error('Vite Server URL not yet available');
		}

		return serverUrl;
	};

	const fragmentGatewayMiddleware = await getFragmentGatewayMiddleware(getServerUrl);
	server.middlewares.use(fragmentGatewayMiddleware);
}

async function getFragmentGatewayMiddleware(getServerUrl: () => string) {
	const fragmentGateway = new FragmentGateway();
	(await glob('**/', { ignore: ['dist/**', 'public/**', 'node_modules/**', 'gateway/**'] })).forEach((appDir) => {
		if (appDir === '.') return;

		const fragmentId = path.basename(appDir);

		fragmentGateway.registerFragment({
			fragmentId: fragmentId,
			piercing: false,
			routePatterns: [`/${fragmentId}/:_*`],
			get endpoint() {
				return getServerUrl();
			},
			prePiercingClassNames: [],
		});
	});

	const fragmentGatewayMiddleware = getNodeMiddleware(fragmentGateway);

	return function fragmentViteMiddleware(req: http.IncomingMessage, res: http.ServerResponse, next: () => void) {
		// if the request is from the gateway middleware then bypass the gateway middleware and serve the request from Vite directly
		if (req.headers['x-fragment-mode']) {
			if (req.url?.endsWith('/')) {
				req.url = req.url + 'fragment.html';
			}
			return next();
		}

		return fragmentGatewayMiddleware(req, res, next);
	};
}
