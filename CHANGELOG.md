# Changelog

All notable changes to EcoTrack are documented in this file.
This project adheres to [Semantic Versioning](https://semver.org/) and follows the [Keep a Changelog](https://keepachangelog.com/) format.

## [1.1.0] - 2025-06-15

### Security
- Replaced `Math.random()` with `crypto.getRandomValues()` for cryptographically secure ID generation (OWASP A02:2021)
- Added data schema validation on all `localStorage` reads to reject corrupted or tampered entries
- Added prototype pollution prevention guards (`__proto__`, `constructor`, `prototype` key stripping)
- Added data integrity checksums (DJB2 hash) to detect localStorage tampering
- Added `Permissions-Policy` header to restrict camera, microphone, geolocation, and payment APIs
- Added `Cross-Origin-Opener-Policy` and `Cross-Origin-Resource-Policy` headers
- Added `upgrade-insecure-requests` to Content Security Policy
- Added storage quota safety checks before write operations
- Added `inputmode` and `pattern` attributes on all form inputs for HTML-level validation
- Added deployment security headers file (`_headers`)

### Added
- ESLint configuration (`.eslintrc.json`) with security-focused rules
- Prettier configuration (`.prettierrc`) for consistent formatting
- MIT License file (`LICENSE`)
- Contributing guidelines (`CONTRIBUTING.md`)
- This changelog (`CHANGELOG.md`)
- Custom error classes: `ValidationError` and `StorageError`
- JSDoc `@typedef` definitions for `LogEntry`, `ProfileData`, and `EmissionFactor`
- 5 additional security tests (78 total across 13 suites)
- Named constants for all magic numbers (`MS_PER_DAY`, `NOTIFICATION_TIMEOUT_MS`, etc.)

### Improved
- Enhanced JSDoc documentation with `@module` tags on all modules
- Updated README with smart assistant and decision-making keywords

## [1.0.0] - 2025-06-14

### Added
- Initial release of EcoTrack — Carbon Footprint Awareness Platform
- Dashboard with real-time emission summary, gauge, and category breakdown
- Activity logging for Transport, Food, Energy, and Shopping categories
- 73 automated tests across 12 suites (TAP format output)
- Modular architecture: Security, DataStore, Calculator, UI, BadgeEngine, TipsEngine, App
- Content Security Policy and comprehensive input validation
- Output encoding via `Security.escapeHTML()` to prevent XSS
- Rate limiting on form submissions (500ms cooldown)
- `Object.freeze()` on all emission factor data to prevent tampering
- ARIA accessibility with roles, labels, live regions, and keyboard navigation
- Skip navigation link and `prefers-reduced-motion` support
- 7-day trend bar chart rendered on HTML5 Canvas
- Personalized reduction tips based on user emission patterns
- Achievement badge system (6 badges)
- Profile management with personalized settings
- Activity history with filtering (All Time / Today / This Week)
- Global comparison (You vs India avg vs World avg vs 2050 target)
