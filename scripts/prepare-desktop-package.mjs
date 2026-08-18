import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const projectDir = process.cwd();
const packageDir = path.join(projectDir, ".desktop-package");
const sourcePackage = JSON.parse(await readFile(path.join(projectDir, "package.json"), "utf8"));

await rm(packageDir, { recursive: true, force: true });
await mkdir(path.join(packageDir, "desktop"), { recursive: true });
await cp(path.join(projectDir, "dist"), path.join(packageDir, "dist"), { recursive: true });
await cp(path.join(projectDir, "desktop", "main.cjs"), path.join(packageDir, "desktop", "main.cjs"));
await cp(path.join(projectDir, "desktop", "server.cjs"), path.join(packageDir, "desktop", "server.cjs"));
await writeFile(
  path.join(packageDir, "package.json"),
  `${JSON.stringify(
    {
      name: sourcePackage.name,
      version: sourcePackage.version,
      description: sourcePackage.description,
      author: sourcePackage.author,
      main: "desktop/main.cjs",
    },
    null,
    2,
  )}\n`,
  "utf8",
);
