# Changelog

All project changes are recorded here. Historical entries summarize development
versions; they do not imply that corresponding Git tags or releases exist.

## Unreleased

### Added
- Git and ZIP upgrade instructions, including configuration and credential preservation.
- ESLint flat configuration, development dependencies, lockfile, and lint scripts.
- Weekly Dependabot checks for npm development dependencies.
- Project maintenance instructions requiring a changelog entry for every change.
- This changelog.

### Changed
- Removed redundant inline global declarations now supplied by ESLint configuration.

## 1.7.6
- Added debug measurements of member displacement against the movement threshold.
- Added package discovery keywords and a project Code of Conduct maintained by DrWatson.

## 1.7.5
- Made refresh-request and data-ready logs debug-only; refresh failures remain visible.

## 1.7.4
- Made below-minimum warnings unconditional.

## 1.7.3
- Added debugLogging to control movement and polling diagnostics.

## 1.7.2
- Added refresh, movement threshold, timeout, and polling-mode logs.

## 1.7.1
- Enforced minimum idle/movement intervals of 5000/1000 ms, a 10-meter movement
  threshold, and a 60000-ms timeout, with configuration warnings.
- Allowed server requests at one-second intervals.

## 1.7.0
- Added movement-aware polling with configurable threshold and quiet period.

## 1.6.1
- Logged member names and IDs for alias setup and documented server-log access.

## 1.6.0
- Added custom member-card aliases keyed by member ID.

## 1.5.2
- Matched grouped marker backgrounds to the configured card background.

## 1.5.1
- Added configurable card and zoom-control colors.

## 1.5.0
- Renamed the module and repository to MMM-Life360-Leaflet.
- Updated installation guidance, token/circle-ID instructions, and sample screenshots.

## Earlier development
- Added the circle map, member cards, battery and charging information, movement
  indicators, configurable card placement, avatar grouping, automatic map fitting,
  optional admin crowns and headings, and configurable module/map dimensions.
