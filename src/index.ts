// The entry point: create the app, mount the routes, listen.

import { app } from './app.js';

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`Listening on http://localhost:${port}`);
});