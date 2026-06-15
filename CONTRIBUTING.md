# Contributing to EcoTrack

Thank you for your interest in contributing to EcoTrack — the Carbon Footprint Awareness Platform!

## Getting Started

### Prerequisites
- Git installed and configured
- Node.js v14+ (for running tests)
- Any modern web browser

### Development Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/Naveen230497/carbon-footprint-tracker.git
   cd carbon-footprint-tracker
   ```
2. Open `index.html` in your browser — no build step or dependencies required.
3. Run tests to verify everything works:
   ```bash
   npm test
   ```

## Code Standards

### JavaScript
- Use `'use strict'` mode in all files
- Use `const` and `let` — never `var`
- Use strict equality (`===`) — never loose equality (`==`)
- Add JSDoc comments (`/** */`) to all public functions
- Use `@typedef` for all custom data structures
- Use named constants — no magic numbers

### Security (Mandatory)
- All user input **must** pass through `Security.sanitizeInput()` or `Security.isValidAmount()`
- All dynamic HTML content **must** use `Security.escapeHTML()` before DOM insertion
- Use `crypto.getRandomValues()` for any random values — never `Math.random()`
- Never use `eval()`, `new Function()`, or `innerHTML` with unsanitized content
- Validate data schema when reading from `localStorage`

### Accessibility
- All interactive elements must have `aria-label` or `aria-labelledby`
- All form inputs must have associated `<label>` elements
- Support keyboard navigation (arrow keys for tabs, Enter/Space for buttons)
- Respect `prefers-reduced-motion` for animations

### Testing
- Add tests for any new functionality
- Tests must pass before submitting a PR: `npm test`
- Follow the existing test patterns (describe/test/assert)
- Cover edge cases and error scenarios

## Project Structure

```
├── index.html          → Semantic HTML structure
├── styles.css          → Design system with CSS custom properties
├── app.js              → Application logic (7 modules)
├── tests/
│   └── test.js         → Comprehensive test suite (78 tests)
├── package.json        → npm test script
├── .eslintrc.json      → Code quality rules
├── .prettierrc         → Code formatting rules
├── LICENSE             → MIT license
├── CONTRIBUTING.md     → This file
├── CHANGELOG.md        → Version history
└── README.md           → Full documentation
```

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes following the code standards above
3. Ensure all tests pass: `npm test`
4. Run ESLint: `npx eslint app.js`
5. Submit a Pull Request with a clear description of changes

## Reporting Issues

If you find a bug or have a suggestion, please open a GitHub Issue with:
- A clear description of the problem
- Steps to reproduce (if applicable)
- Expected vs actual behavior
