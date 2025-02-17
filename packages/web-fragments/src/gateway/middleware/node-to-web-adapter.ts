import stream from 'node:stream';
import streamWeb from 'node:stream/web';
import http from 'node:http';

export function nodeToWebMiddleware(webMiddleware: (req: Request, next: () => Promise<Response>) => Promise<Response>) {
	return async function nodeMiddleware(
		nodeRequest: http.IncomingMessage,
		nodeResponse: http.ServerResponse,
		nodeNext: () => void,
	) {
		const webRequest = nodeRequestToWebRequest(nodeRequest);

		const { promise: callNodeNextPromise, resolve: callNodeNextResolve } = Promise.withResolvers<void>();
		const { originResponsePromise, sendResponse } = nodeToWebResponse(nodeResponse, nodeNext, callNodeNextPromise);
		const webNext = function webNodeCompatNext() {
			console.log('webNodeCompatNext called!!!');
			// signal that we want nodeNext fn to be called
			callNodeNextResolve();
			return originResponsePromise;
		};

		const processedWebResponse = await webMiddleware(webRequest, webNext);
		sendResponse(processedWebResponse);
	};
}

function nodeRequestToWebRequest(nodeReq: http.IncomingMessage): Request {
	const headers = new Headers();

	for (const [key, value] of Object.entries(nodeReq.headers)) {
		if (Array.isArray(value)) {
			value.forEach((val) => headers.append(key, val));
		} else if (value) {
			headers.append(key, value);
		}
	}

	let body;
	if (nodeReq.method !== 'GET' && nodeReq.method !== 'HEAD') {
		body = stream.Readable.toWeb(nodeReq) as ReadableStream<Uint8Array>;
	}

	return new Request(nodeRequestToUrl(nodeReq), {
		method: nodeReq.method,
		headers,
		body,
	});
}

export function nodeRequestToUrl(nodeReq: http.IncomingMessage): URL {
	return new URL(`${isHttps(nodeReq) ? 'https' : 'http'}://${nodeReq.headers.host || 'localhost'}${nodeReq.url}`);
}

interface OriginResponse {
	// readyToSendHead is a back channel so that we know when to actually send headers, see writeHead patch below
	head: Promise<ResponseInit> & { readyToSendHead?: true };
	body: ReadableStream<Uint8Array>;
}

function interceptNodeResponse(
	response: http.ServerResponse,
	next: () => void,
	callNodeNextPromise: Promise<void>,
): { originResponse: OriginResponse; serverResponse: http.ServerResponse } {
	let streamController: ReadableStreamDefaultController<any>;
	const readableStream = new ReadableStream<Uint8Array>({
		start(controller) {
			streamController = controller;
		},
	});

	// patch response
	const orig = {
		flushHeaders: response.flushHeaders.bind(response),
		write: response.write.bind(response),
		writeHead: response.writeHead.bind(response),
		writeHeadUnbound: response.writeHead,
		end: response.end.bind(response),
	};

	let originHead: ResponseInit;

	let { promise: originHeadPromise, resolve: originHeadResolve } = Promise.withResolvers<ResponseInit>();
	function retrieveOrigHead(
		statusCode: number,
		statusMessage?: string,
		headers?: http.OutgoingHttpHeaders | http.OutgoingHttpHeader[],
	) {
		console.log('retrieveOrigHead', statusCode, statusMessage, headers);
		if (originHead) {
			console.log('warning: Response head has already been flushed!');
			return;
		}

		originHead = {
			status: statusCode ?? response.statusCode,
			statusText: statusMessage ?? response.statusMessage,
			// TODO: correctly merge array cookies and flatten them into an object
			headers: { ...(response.getHeaders() as Record<string, string>), ...(headers as Record<string, string>) },
		};

		originHeadResolve(originHead);
	}

	// response.flushHeaders = function interceptingFlushHeaders() {
	// 	console.log('flushHeaders');
	// 	// TODO: is it ok to completely ignore?
	// 	// should we just resolve the originHeadPromise here?
	// 	return response;
	// };

	response.on('drain', () => {
		console.log('drain...');
	});

	response.on('prefinish', () => {
		console.log('prefinish...');
	});

	response.on('end', () => {
		console.log('end...');
	});

	response.on('finish', () => {
		console.log('finish...');
	});

	response.writeHead = function interceptingWriteHead(statusCode: number): http.ServerResponse {
		// @ts-ignore readyToSendHead is a back channel
		if (originHeadPromise?.readyToSendHead) {
			console.log('writeHead (intercepted with readyToSendHead signal)', ...arguments);
			//return orig.writeHead.apply(this, arguments);
			// @ts-ignore
			return orig.writeHead(...arguments);
		}
		const statusMessage: string = arguments[1] instanceof String ? (arguments[1] as string) : '';
		const headers: http.OutgoingHttpHeaders =
			arguments[1] instanceof Object ? (arguments[1] as http.OutgoingHttpHeaders) : arguments[2];

		console.log('writeHead (intercepted)', statusCode, statusMessage, headers);
		retrieveOrigHead(statusCode, statusMessage, headers);

		// restore writeHead
		// TODO: we might be restoring too early here, but it's unclear if there is a better way to do it
		//response.writeHead = orig.writeHeadUnbound;
		return response;
	}; //satisfies typeof http.ServerResponse.prototype.writeHead;

	response.write = function interceptingWrite(chunk: any) {
		console.log('write (intercepted)', chunk);
		const encoding =
			chunk instanceof String
				? arguments[1] instanceof String
					? (arguments[1] as BufferEncoding)
					: 'utf8'
				: undefined;
		const callback = arguments[1] instanceof Function ? arguments[1] : arguments[2];

		const buffer = Buffer.from(chunk, encoding);
		streamController.enqueue(buffer);
		if (callback) callback(null);
		return true;
	};

	response.end = function interceptingEnd() {
		console.log('end (intercepted)', arguments);
		const chunk = arguments[0] instanceof Function ? null : arguments[0];
		const encoding =
			chunk instanceof String
				? arguments[1] instanceof String
					? (arguments[1] as BufferEncoding)
					: 'utf8'
				: undefined;
		const callback =
			arguments[0] instanceof Function ? arguments[0] : arguments[1] instanceof Function ? arguments[1] : arguments[2];

		if (chunk) {
			const buffer = Buffer.from(chunk, encoding);
			streamController.enqueue(buffer);
		}
		streamController.close();
		if (callback) callback(null);
		return response;
	};

	// call the next node middleware if we receive a signal to do so
	callNodeNextPromise.then(() => {
		next();
	});

	// create a new ServerResponse object that has it's prototype set to the original response
	// this allows us to inherit everything from the original response while still restoring
	// the patched methods in a way that will keep the methods patched for anyone who doesn't
	// have a reference to this new response object.
	const restoredResponse = Object.create(response);
	//restoredResponse.flushHeaders = orig.flushHeaders;
	//restoredResponse.writeHead = orig.writeHead;
	restoredResponse.write = orig.write;
	restoredResponse.end = orig.end;

	return {
		originResponse: { head: originHeadPromise, body: readableStream },
		serverResponse: restoredResponse,
	};
}

function nodeToWebResponse(
	nodeResponse: http.ServerResponse,
	nodeNext: () => void,
	callNodeNextPromise: Promise<void>,
): {
	originResponsePromise: Promise<Response>;
	sendResponse: (response: Response) => void;
} {
	const { originResponse, serverResponse: outboundServerResponse } = interceptNodeResponse(
		nodeResponse,
		nodeNext,
		callNodeNextPromise,
	);

	let originResponsePromise = originResponse.head.then((head) => new Response(originResponse.body, head));

	//const [headerFlushingStream, originReadableStream2] = originResponse.body.tee();
	//
	//let originResponsePromise = new Promise<Response>((resolve) => {
	// headerFlushingStream.pipeThrough(
	// 	new TransformStream({
	// 		start(controller) {
	// 			console.log('Starting stream processing...');
	// 			const contentType = nodeResponse.getHeader('content-type') as string;
	// 			const responseInit = {
	// 				headers: contentType ? { 'content-type': contentType } : undefined,
	// 				status: nodeResponse.statusCode,
	// 				statusText: nodeResponse.statusMessage,
	// 			};
	// 			const response = new Response(originReadableStream2, responseInit);
	// 			resolve(response);
	// 			controller.terminate();
	// 		},
	// 	}),
	// );
	//});

	const sendResponse = async (response: Response) => {
		console.log('sendResponse', response);
		// response.headers.forEach((value, key) => {
		// 	nodeResponse.setHeader(key, value);
		// 	console.log('sending headers:', key, value);
		// });

		// nodeResponse.statusCode = response.status;
		// nodeResponse.statusMessage = response.statusText;

		// TODO: is this going to preserve several cookies?
		const headersAsObject = Object.fromEntries(Array.from(response.headers.entries()));

		// back channel to signal that we are ready to send the http head via the outbound connection
		originResponse.head.readyToSendHead = true;
		// await new Promise((resolve) => {
		// 	setTimeout(resolve, 5000);
		// });

		// outboundServerResponse.statusCode = response.status;
		// outboundServerResponse.statusMessage = response.statusText;
		// // response.headers.forEach((value, name) => {
		// 	// TODO: handle duplicate headers? like cookie?
		// 	console.log('setting header', name, value);
		// 	outboundServerResponse.setHeader(name, value);
		// });
		console.log('headers set?', outboundServerResponse.headersSent);
		//outboundServerResponse.setHeader('transfer-encoding', '');

		console.log('about to write headers!!!');
		outboundServerResponse.writeHead(response.status, response.statusText, headersAsObject);

		console.log('piping body');

		//setTimeout(() => {
		stream.Readable.fromWeb(response.body as streamWeb.ReadableStream<any>)
			.pipe(outboundServerResponse)
			.on('drain', () => {
				console.log('drain piping body');
			})
			.on('error', (err) => {
				console.log('error piping body', err);
			})
			.on('close', () => {
				console.log('piping body close');
			});

		console.log('piping body end');
		//}, 10000);
	};

	return { originResponsePromise, sendResponse };
}

/**
 * Determines if a request is HTTPS.
 * @param {IncomingMessage | Request} req - The request object.
 * @returns {boolean} - Whether the request is HTTPS.
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Forwarded-Proto
 */
export const isHttps = (req: http.IncomingMessage | Request): boolean => {
	if (isFetchRequest(req)) {
		// we need to check if the request is a Fetch API Request
		// and handle it separately because of how the headers are accessed
		return req.headers.get('x-forwarded-proto') === 'https';
	} else {
		// handle Node.js IncomingMessage
		return req.headers['x-forwarded-proto'] === 'https' || (req.socket as any)?.encrypted === true;
	}
};

/**
 * Determines if a request is a Fetch API Request.
 * @param {IncomingMessage | Request} req - The request object.
 * @returns {boolean} - Whether the request is a Fetch API Request.
 */

export const isFetchRequest = (req: any): req is Request => {
	return typeof req.headers?.get === 'function';
};
