# Deploy to a free public URL

Recommended platform: Render Free Web Service.

Render can run this Node server as-is and gives you a free URL like:

```text
https://world-cup-calendar.onrender.com
```

Steps:

1. Create or sign in to a Render account: https://render.com
2. Put this `world-cup-calendar` folder in a GitHub repository.
3. In Render, choose **New > Blueprint**.
4. Connect the GitHub repository.
5. Render will read `render.yaml`.
6. Deploy the service.

Settings if you create the service manually:

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
Instance Type: Free
```

Notes:

- Free Render services may sleep after inactivity, so the first visit after a quiet period can take a little longer.
- The app refreshes match data on page open and periodically while open.
- A paid instance or another always-on platform is needed if you want zero cold starts.
