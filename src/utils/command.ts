export function getNpxCommand(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}
