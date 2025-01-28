# non-routable fragment

```html
<script>
	import reframed from 'reframed';

	reframed('https://hello.web-fragments.dev');
</script>

<!-- results in: -->
<article>
	#shadow root
	<wf-html>
		<wf-head>
			<title>hello world fragment!</title>
			<h1>hello world</h1>
			<img src="wave.png" />
			<script>
				<!-- innert ->
				const img = document.querySelector('img');
				img.addEventListener('click', () => {
					alert('hello!');
				});
				const i = document.createElement('img');
				i.src = 'foo.png';
				img.appendAfter(i);
			</script>
		</wf-head>
		<wf-body> </wf-body>
	</wf-html>
</article>
<iframe hidden>
	<h1>hello world</h1>
	<img src="wave.png" />
	<script>
		const img = document.querySelector('img');
		img.addEventListener('click', () => {
			alert('hello!');
		});
	</script>
</iframe>
```

hello.html

```html
<!DOCTYPE >
<html>
	<head>
		<title>hello world fragment!</title>
	</head>
	<body>
		<h1>hello world</h1>
		<img src="wave.png" />
		<script>
			const img = document.querySelector('img');
			img.addEventListener('click', () => {
				alert('hello!');
			});
		</script>
	</body>
</html>
```

```html
<fragment-host src="https://web-fragments.dev/hello.html">
	<!-- this is where the hello.html will go (under a shadow root) -->
</fragment-host>
```

# non-routable imperative

```html
<script>
	import from 'web-fragments/init';
	import {registerElements, registerServiceWorker, FragmentHost, FragmentOutlet, WebFragment} from 'web-fragments';

	//reframed('https://hello.web-fragments.dev');

	const cart = new WebFragment({src: '/_fragments/cart', routable: false /* default */});
	document.body.appendChild(cart);

	// should clean up DOM, css, iframes.
	cart.remove();
</script>
```

# non-routable imperative

```html
<script>
	import from 'web-fragments/init';
	import {registerElements, registerServiceWorker, FragmentHost, FragmentOutlet, WebFragment} from 'web-fragments';

	//reframed('https://hello.web-fragments.dev');

	const cart = new WebFragment({src: '/_fragments/cart', routable: false /* default */});
	document.body.appendChild(cart);

	// should clean up DOM, css, iframes.
	cart.remove();
</script>
```

Needs:

- creation
  - imperatively created fragments
    - don't require web component registration
  - declaratively created fragments
- routing
  - support non-routable/non-navigatable fragments
    - don't participate in global history management (browser url updates, back button support)
    - can't read the current navigator url
    - don't receive global popstate events
    - can have internal routing and navigation, but this routing is not exposed to the user, aside from UI updates
  - support routable/navigatable fragments
- reusability
  - reusable

Missing specs:

- atomic dom move: https://github.com/whatwg/dom/issues/1255
- baseURI for shadowroot: https://github.com/WICG/webcomponents/issues/581
- moving shadowroot between elements
- HTML streaming to DOM
- js context isolation / realms
