import { createApp } from "./app.js";
import { openDatabase } from "./db.js";

const port = Number(process.env.PORT ?? 8787);
const db = openDatabase(process.env.DATABASE_PATH);
const app = createApp({ db });

app.listen(port, "0.0.0.0", () => {
  console.log(`Classroom server listening on http://0.0.0.0:${port}`);
});
