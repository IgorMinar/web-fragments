import { FragmentGateway, getServiceWorkerMiddleware } from 'web-fragments/gateway';

const gateway = new FragmentGateway();
const appOrigin = self.location.origin;

// Register fragments with the gateway
gateway.registerFragment({
	fragmentId: 'remix',
	endpoint: 'http://localhost:3000',
	piercing: true,
	routePatterns: [
		'/remix-page',
		'/remix-page/:_*',
		'/_fragment/remix/:_*',
		'/app/:_*',
		'/@id/:_*',
		'/@vite/:_*',
		'/node_modules/.vite/:_*',
	],
	onSsrFetchError: () => ({
		response: new Response('<p>Remix fragment not found</p>', {
			headers: { 'content-type': 'text/html' },
		}),
	}),
});

gateway.registerFragment({
	fragmentId: 'qwik',
	endpoint: 'http://localhost:8123',
	piercing: true,
	forwardFragmentHeaders: ['x-fragment-name'],
	routePatterns: ['/qwik-page', '/qwik-page/:_*', '/_fragment/qwik/:_*'],
	onSsrFetchError: () => ({
		response: new Response('<p>Qwik fragment not found</p>', {
			headers: { 'content-type': 'text/html' },
		}),
	}),
});

gateway.registerFragment({
	fragmentId: 'solid-sierpinski-triangle',
	endpoint: 'https://solid-sierpinski-triangle.fragments.demos.web-fragments.dev',
	routePatterns: [
		'/solid-sierpinski-triangle',
		'/__wf/dev.web-fragments.demos.fragments.solid-sierpinski-triangle/:_*',
	],
});

const middleware = getServiceWorkerMiddleware(gateway, {
	initializeHtmlRewriter: async () => {
		if (self.HTMLRewriter) {
			return;
		}

		const module = await import('wf-htmlrewriter/dist/html_rewriter.js');
		const init = module.default;
		const { HTMLRewriter } = module;
		const wasmUrl = new URL('wf-htmlrewriter/dist/html_rewriter_bg.wasm', import.meta.url);
		const wasmResponse = await fetch(wasmUrl);
		await init(wasmResponse);
		self.HTMLRewriter = HTMLRewriter;
		console.log('[SW] HTMLRewriter polyfill initialized');
	},
});

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	const secFetchDest = event.request.headers.get('sec-fetch-dest');

	// Only log for our fragment routes to reduce noise
	if (url.pathname.startsWith('/remix-page') || url.pathname.startsWith('/qwik-page')) {
		console.log('[SW] Fetch event:', url.pathname, 'sec-fetch-dest:', secFetchDest);
		console.log('[SW] Request headers:', Object.fromEntries(event.request.headers.entries()));
	}

	if (event.request.method !== 'GET') {
		return;
	}

	if (event.request.headers.get('X-Service-Worker-Bypass') === 'true') {
		return;
	}

	if (event.request.headers.get('x-fragment-mode') === 'embedded') {
		// Fragment requests from the gateway should bypass the SW to avoid loops
		return;
	}

	// Check if this is a fragment route
	const requestFragmentId = event.request.headers.get('x-web-fragment-id') ?? undefined;
	const matchedFragment = gateway.matchRequestToFragment(url.pathname + url.search, requestFragmentId);

	// Only intercept fragment routes
	if (matchedFragment) {
		console.log(
			'[SW] Intercepting fragment route:',
			url.pathname,
			'matched fragment:',
			matchedFragment.fragmentId,
			'sec-fetch-dest:',
			secFetchDest,
			'clientId:',
			event.clientId,
			'\nresultingClientId:',
			event.resultingClientId,
			'destination:',
			event.request.destination,
			'mode:',
			event.request.mode,
		);

		event.respondWith(
			(async () => {
				const targetClientId = event.clientId ?? event.resultingClientId;
				const client = targetClientId ? await self.clients.get(targetClientId) : null;
				const destHeader = event.request.headers.get('sec-fetch-dest');
				const requestDestination = event.request.destination;
				const secFetchUser = event.request.headers.get('sec-fetch-user');
				const navDestination = destHeader ?? requestDestination;
				const clientFrameType = client?.frameType;
				const nonUserNavigate =
					event.request.mode === 'navigate' &&
					navDestination === 'document' &&
					secFetchUser !== '?1' &&
					clientFrameType === 'nested';
				const isIframeNavigation = destHeader === 'iframe' || requestDestination === 'iframe';

				let requestForMiddleware = event.request;
				if (isIframeNavigation) {
					const headers = new Headers(event.request.headers);
					headers.set('x-wf-fetch-dest', 'iframe');
					requestForMiddleware = new Request(event.request, { headers });
					console.log(
						'[SW] Forcing iframe stub flow for request',
						url.pathname,
						'client frameType:',
						clientFrameType,
						'nonUserNavigate:',
						nonUserNavigate,
						'sec-fetch-user:',
						secFetchUser,
					);
				}

				// Create a next() function that fetches the HTML shell from the origin server
				// We need to bypass the service worker to avoid infinite loops
				const next = async () => {
					// Use the first path segment as the shell name (e.g., /qwik-page/details -> /qwik-page.html)
					const [, shellSegment = 'index'] = url.pathname.split('/');
					const htmlPath = `/${shellSegment || 'index'}.html`;
					const htmlUrl = new URL(htmlPath, self.location.origin);
					console.log('[SW] Fetching HTML shell from:', htmlUrl.href);

					// Fetch with a header to bypass this service worker if needed
					return fetch(htmlUrl, {
						headers: {
							'X-Service-Worker-Bypass': 'true',
						},
					});
				};

				const response = await middleware(requestForMiddleware, next);
				console.log('[SW] Middleware returned response:', response);
				return response;
			})(),
		);
	}
});

self.addEventListener('install', (event) => {
	console.log('[SW] Service Worker installed');
	// Skip waiting to activate immediately
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	console.log('[SW] Service Worker activated');
	// Take control of all clients immediately
	event.waitUntil(self.clients.claim());
});
