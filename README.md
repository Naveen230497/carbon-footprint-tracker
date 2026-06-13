# EcoTrack — Carbon Footprint Tracker

A single-page, zero-dependency carbon footprint tracker that helps users log daily activities, calculate their real-time carbon emissions, and receive personalized reduction tips.

## Features
- **Dashboard**: Live stats (today/week/month), visual footprint rating gauge, category breakdown, and achievement badges.
- **Log Activity**: 4 forms (Transport, Food, Energy, Shopping) with emission factors calibrated to India and global averages.
- **Insights**: 7-day bar chart, personalized reduction tips, and global comparisons.
- **History**: Filterable log of activities with deletion and bulk clear options.
- **Profile**: Personal settings for diet, transport, household size, and monthly goals.

## Architecture
- **Zero Dependencies**: Pure HTML, CSS, and Vanilla JavaScript. No build steps or package managers required.
- **Local Storage**: All data is securely stored on the user's device via `localStorage`. No external network requests.
- **Single File**: Everything runs from a single `index.html` file (~50KB) for maximum efficiency and portability.

## Usage
Simply open `index.html` in any modern web browser. 

## Deployment
Since this is a static, single-page application with no backend, it can be hosted anywhere:
- GitHub Pages
- Vercel / Netlify
- Or simply run locally from your file system.
