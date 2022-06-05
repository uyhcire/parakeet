Parakeet is like [Copilot](https://copilot.github.com/), but for Colab and Jupyter notebooks. It's implemented as a small Chrome extension.

![Example of usage][./example.png]

# Installing

* Get a [GooseAI](https://goose.ai/) account and get an API key
* Build the extension:

```
cd extension/
yarn install
yarn build
```

* Load the `dist` directory as a Chrome extension using `Load unpacked`
* Enter your API key when prompted
* Open any Colab notebook and start typing!