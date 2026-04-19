# Summary

Built a minimal static single-page app for Oliver Burkeman's 3/3/3 method.

## App

- Single-file app in `index.html`
- Brutalist, minimal layout
- One large text area for the main project
- Three separate text areas for shorter tasks
- Three separate text areas for maintenance tasks
- Local storage autosave
- One-click clear-all button
- Mobile layout checked in Chrome mobile emulation

## GitHub

- Initialized this directory as a git repo
- Added `README.md` and `.gitignore`
- Created GitHub repo `mojones/333`
- Pushed the app to `main`
- Enabled GitHub Pages for the repo

## Shared Domain Setup

- Created `mojones/mojones.github.io` as the root GitHub Pages repo
- Added a minimal landing page there
- Added `CNAME` for `preliminarywork.com`
- Set `preliminarywork.com` as the GitHub Pages custom domain
- Enabled HTTPS in GitHub Pages

## DNS

Configured Gandi DNS for `preliminarywork.com`:

- `A` records for apex:
  - `185.199.108.153`
  - `185.199.109.153`
  - `185.199.110.153`
  - `185.199.111.153`
- `CNAME` for `www`:
  - `mojones.github.io.`

## Live URLs

- Root site: `https://preliminarywork.com/`
- This project: `https://preliminarywork.com/333/`
