# Deployment

The repository root contains `package.json`, `src`, `public` and `.github`. GitHub Pages serves the generated `dist` directory, not the source `index.html`.

The Pages workflow installs the lockfile, scans the public inventory, runs unit checks, builds the browser edition and uploads a Pages artifact. A separate deployment job receives only Pages/OIDC permissions. Dependencies use pinned action revisions. The workflow needs no personal access token or application secret.

For your own repository, select **Settings → Pages → GitHub Actions**. Push to `main` or run **Deploy game to GitHub Pages** manually. Wait for the workflow to finish, then test its deployment URL on desktop and a landscape phone. Assets use relative URLs so repository subpaths work.

Local reproduction:

```sh
npm ci
npm run audit:public
npm test
npm run build
npm run preview
```

Mission saves and touch preferences are scoped to browser and origin. Localhost data does not transfer to Pages. This static game has no application server, database or API credential to configure. GitHub's own hosting requests are outside the game's local-storage behavior.

See [GitHub's custom Pages workflow guide](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) for platform configuration.
