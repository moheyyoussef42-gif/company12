Deploying to Vercel (no card / static)
-------------------------------------

This project will be deployed as a static site on Vercel. The backend `server.js` and file-based storage will not run on Vercel (ephemeral filesystem). The frontend will work and will fall back to `localStorage` if the server endpoints are not available.

Steps to deploy from the Vercel web UI:

1. Open https://vercel.com/new and click **Import Project**.
2. Connect your GitHub account and select the repository: `moheyyoussef42-gif/company12`.
3. When configuring the project:
   - Framework Preset: **Other**
   - Build Command: leave empty
   - Output Directory: leave empty
4. Click **Deploy**.

Notes:
- This will give you a permanent Vercel URL (e.g. `https://company12-omega.vercel.app`).
- Bookings and settings will use `localStorage` unless you set up an external API or database (Supabase, Firebase, or a deployed Node server).
- To add a backend later, convert the API endpoints into Vercel Serverless Functions under `/api` or host the Node server on Render/Railway.

If you want, I can watch the deploy logs and help fix any issues once you trigger the import.
