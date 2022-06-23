#!/bin/bash

# Build the extension with Parcel.
# --no-optimize makes debugging easier, and --no-content-hash ensures that the options page has a stable URL.
rm -rf dist/
yarn run parcel build manifest.json --config @parcel/config-webextension --no-optimize --no-content-hash

# Ensure that the extension has a stable ID (the same ID as the published extension in the Chrome Web Store)
EXTENSION_KEY="MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAv1sFoFy/EEClmPPTceOtDMFBZ6Nf3O6wUVrHdLo3GXV9wwCYu12khq1CXOmU0uPmgl+J8SX5+P0EhyjTTT9HxtKSYRY1jFYhc9sKYCtb5C4N68AYqyrw7OQtxuBM4VNZRaiMr/vSWc8uhEkm4Q0d750gOK6sU6Kb3JbOyXAnvSEo+hVuydVMNEQzDyFhnj1Ubm3ZkreOFxxUPdNNmk6jLmlggam9g4rX8q3DL03Z7s7sNNxaZmBmCz02ircZgtLdM/HtO9XOt5wIhK/5fnnoBYmQ4ZvxsYXftPnDssJzVB0brQM1pgHwk0lQJuCltPSd+I8FB9Hn0cO0ZlnhE0f9GQIDAQAB"
json -I -f dist/manifest.json -e "this.key='$EXTENSION_KEY'" 2> /dev/null

# Allow Auth0 to redirect back to the extension after login.
AUTH0_DOMAIN=$(node -e 'const config = require("./config.json"); console.log(config.auth0_domain);')
json -I -f dist/manifest.json -e 'this.web_accessible_resources=[{"resources":["options_auth0.915298d6.html"],"matches":[]}]' 2> /dev/null
json -I -f dist/manifest.json -e "this.web_accessible_resources[0].matches[0]='https://$AUTH0_DOMAIN/*'" 2> /dev/null