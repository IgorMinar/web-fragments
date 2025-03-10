/**
 * The web component that is used to render a web fragment.
 */
export class WebFragment extends HTMLElement {
	async connectedCallback() {
		const fragmentId = this.getAttribute('fragment-id');
		const fragmentSrc = this.getAttribute('src');

		if (!fragmentId) {
			throw new Error('The <web-fragment> is missing fragment-id attribute!');
		}

		// Since fragments will most likely contain other block elements, they should be blocks themselves by default
		// TODO: move this into a shadow dom
		this.style.display = 'block';
		this.style.position = 'relative';

		const piercedHostNotFound = this.dispatchEvent(
			new Event('fragment-outlet-ready', { bubbles: true, cancelable: true }),
		);

		// There is no <web-fragment-host> element in the document that could be adopted into this <web-fragment>.
		// Instantiate a new <web-fragment-host> element to fetch the fragment
		if (piercedHostNotFound) {
			const fragmentHost = document.createElement('web-fragment-host');
			fragmentHost.setAttribute('fragment-id', fragmentId);
			if (fragmentSrc) {
				fragmentHost.setAttribute('src', fragmentSrc);
			}
			this.appendChild(fragmentHost);
		}

		// TODO: is this the best way to expose the reframed iframe? This is a race condition trap.
		// review and discuss...
		Object.defineProperty(this, 'iframe', {
			get: () => (this.firstElementChild as HTMLElement & { iframe: HTMLIFrameElement })?.iframe,
		});
	}
}
