# Slate Conference Planner

## https://lloydlentz.github.io/slate-session-planner-antigravity

A simple, client-side web application designed to help teams collectively review, sort, and organize their schedules for an upcoming conference. It fetches a raw JSON feed endpoint and produces an interactive, highly stylistic dashboard. Best of all, no backend is needed—all user preferences and team assignments are efficiently persisted to your browser via `localStorage`.

## Features

- **Light & Dark Mode**: A premium, glassmorphic UI that fully switches between dark and light themes dynamically based on user selection.
- **Team Management Settings**: Easily add all your teammates by defining their names in the Settings modal. Then, you can explicitly toggle "⭐ Interested" and "✅ Going" for every specific team member at the session level.
- **Versatile Views**:
  - *All Sessions*: Browse everything systematically, grouped by the "Session Type".
  - *Schedule Calendar*: Switch over to a clean 3-day chronological grid tracking all time slots. Just hover over a calendar node to preview the session description in a dynamic tooltip.
- **Advanced Filtering Toolset**: A pinned control bar allows intersectional filtering. Find the exact session by mapping Day, Type, specifically assigned Team Member, and their Attendance Status.
- **Automatic Chronological Sorting**: Time calculations process standard 12-hour AM/PM formats, natively ensuring your 1:00 PM sessions follow your 12:00 PM sessions elegantly.

## How to View and Run

This project relies on zero external build tools, frameworks, or bundlers. Simply:

1. Download or clone this repository.
2. Open `index.html` directly in any modern web browser.
3. *Optional*: Host this folder on platforms like **GitHub Pages**, **Vercel**, or **Netlify** to easily share it across your organization. 

> *Note: If you are running into CORS limitations when fetching the JSON endpoint directly from `file:///`, simply spin up a temporary dev server (e.g., `npx serve .` or Python's `python -m http.server`) or use an extension like Live Server in VS Code.*

## Modifying the Data Source

To change the conference feed, simply open `app.js` and modify the first line defining the `ENDPOINT_URL`:
```javascript
const ENDPOINT_URL = "https://your-custom-json-feed-url";
```
