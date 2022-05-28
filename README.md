Parakeet is like [Copilot](https://copilot.github.com/), but for Colab and Jupyter notebooks. It's implemented as a small Chrome extension.

# Installing

* Get a [GooseAI](https://goose.ai/) account and get an API key
* Build the extension:

```
cd extension/
yarn install
API_KEY=$YOUR_API_KEY yarn build
```

* Load the `dist` directory as a Chrome extension using `Load unpacked`
