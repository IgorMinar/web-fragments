export class WebFragment extends HTMLElement {
	#isInitialized = false;

	constructor(options?: { src: string }) {
		super();
		console.log('constructor', arguments);
		if (options?.src) {
			this.setAttribute('src', options.src);
		}
	}

	async connectedCallback() {
		// don't reinitialize if we are just reconnecting an element during a move
		if (this.#isInitialized) return;
		this.#isInitialized = true;

		this.#initialize();
	}

	#initialize() {
		let fragmentSrc = this.getAttribute('src');

		if (!fragmentSrc) {
			throw new Error('💥 fragment-host[src] attribute is required! Missing on element: ' + this.outerHTML);
		}

		const wasPierced = this.shadowRoot == null;

		if (wasPierced) {
			//reframeFromExistingShadow(this.shadowRoot);
		} else {
			//reframeFromFetch();
		}
	}
}
