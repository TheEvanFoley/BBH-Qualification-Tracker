import { createApp } from "./app.js";
import { createDatabase } from "./db.js";

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const host = process.env.HOST ?? "0.0.0.0";
const db = await createDatabase();
const app = createApp(db);

app.listen(port, host, () => {
  console.log(`Big Buck qualifier tool listening on http://${host}:${port}`);
});
