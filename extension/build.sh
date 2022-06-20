#!/bin/bash

# Build the extension with Parcel.
# --no-optimize makes debugging easier, and --no-content-hash ensures that the options page has a stable URL.
rm -rf dist/
yarn run parcel build manifest.json --config @parcel/config-webextension --no-optimize --no-content-hash

# Ensure that the extension has a stable ID.
# Source: https://stackoverflow.com/a/46739698
if [ ! -f key.pem ]; then
  echo "key.pem was not found. Please create a private key for yourself and try again. See README.md for more information."
  exit 1
fi
EXTENSION_KEY=$(openssl rsa -in key.pem -pubout -outform DER 2> /dev/null | openssl base64 -A)
json -I -f dist/manifest.json -e "this.key='$EXTENSION_KEY'" 2> /dev/null

# Allow Auth0 to redirect back to the extension after login.
AUTH0_DOMAIN=$(node -e 'const config = require("./config.json"); console.log(config.auth0_domain);')
json -I -f dist/manifest.json -e 'this.web_accessible_resources=[{"resources":["options_auth0.915298d6.html"],"matches":[]}]' 2> /dev/null
json -I -f dist/manifest.json -e "this.web_accessible_resources[0].matches[0]='https://$AUTH0_DOMAIN/*'" 2> /dev/null