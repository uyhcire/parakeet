Parakeet is like [Copilot](https://copilot.github.com/), but for Colab and Jupyter notebooks. It's implemented as a small Chrome extension.

![Example of usage](./example.png)

# Installing the extension

- First, build it:

```
cd extension/
yarn install
yarn build
```

- Then load the `dist` directory as a Chrome extension using `Load unpacked`
- Create an account or sign in
- Open any Colab or Jupyter notebook and start typing!

# Hosting Parakeet yourself

To host Parakeet yourself, you'll need access to OpenAI's private beta of Codex. If you do have access, you can deploy Parakeet to your own Firebase account by following these steps:

- Create a Firebase project and install the Firebase CLI
- Set up the repo as a Firebase project
  - Make sure `.firebaserc` exists in the repo root directory
  - Obtain your `firebaseConfig` object and create `extension/config.js` with `export const firebaseConfig = ...`
- Deploy to your Firebase project from the root directory of this repo
- Enable the email-password sign-in provider in Firebase
- Give the Cloud Function permission to generate custom auth tokens. If you run into trouble, you can take a look at Firebase's [troubleshooting guide](https://firebase.google.com/docs/auth/admin/create-custom-tokens#troubleshooting).
  - Enable the IAM API [here](https://console.cloud.google.com/apis/library/iamcredentials.googleapis.com)
  - Go to IAM in the Google Cloud console and grant the "Service Account Token Creator" role to `{project-name}@appspot.gserviceaccount.com`
  - Wait a few minutes for the new role to be usable by your Cloud Function. If you try to run your Cloud Function immediately, you might see an error.
