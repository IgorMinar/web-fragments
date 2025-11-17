/*
 * WHAT IS THIS FILE?
 *
 * It's the entry point for Cloudflare Pages when building for production.
 *
 * Learn more about the Cloudflare Pages integration here:
 * - https://qwik.dev/docs/deployments/cloudflare-pages/
 *
 */
import { createQwikCity, type PlatformCloudflarePages } from '@builder.io/qwik-city/middleware/cloudflare-pages';
import qwikCityPlan from '@qwik-city-plan';
import { manifest } from '@qwik-client-manifest';
import render from './entry.ssr';

declare global {
	interface QwikCityPlatform extends PlatformCloudflarePages {}
}

const fetch = (request: Request, env: any, ctx: any) => {
	console.log('igor and natalia were vibe coding here!!!')


	// Handle OPTIONS preflight requests immediately
	if (request.method === 'OPTIONS') {
		return new Response(null, {
			status: 200,
			headers: {
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type,upgrade-insecure-requests,x-forwarded-host,x-forwarded-proto,x-fragment-mode,x-wf-fetch-dest',
				'Access-Control-Max-Age': '86400', // 24 hours
			},
		});
	}

	return createQwikCity({ render, qwikCityPlan, manifest })(request, env, ctx);
}

export { fetch };
