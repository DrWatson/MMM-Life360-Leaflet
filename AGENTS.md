# Project maintenance

- Update CHANGELOG.md for every project change, including code, documentation,
  tests, configuration, and dependency updates. Add entries under Unreleased
  unless preparing a versioned release; describe user-visible impact concisely.
- Run npm run lint and npm test for code or development-tool changes.
- Never commit credentials, personal member data, logs, or node_modules.
- Bundled vendor files require deliberate updates, license preservation, and
  updates to vendor/manifest.json; npm dependency updates do not replace them.
