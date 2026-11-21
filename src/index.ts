/**
 * Entry point: starts the HTTP server for the app built in `app.ts`.
 */
import { app } from './app.js';

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});