// scripts/build-provider.mjs
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const csproj = resolve(root, 'src/spe/provider-csharp/Mockingbird.Provider/Mockingbird.Provider.csproj');
const outDir = resolve(root, 'data/spe');

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

console.log(`[build-provider] dotnet build -> ${outDir}`);
execSync(`dotnet build "${csproj}" -c Release -o "${outDir}" --nologo`, {
  stdio: 'inherit',
});

const dllPath = resolve(outDir, 'Mockingbird.Provider.dll');
if (!existsSync(dllPath)) {
  console.error(`[build-provider] FAIL: ${dllPath} not produced`);
  process.exit(1);
}
console.log(`[build-provider] OK -> ${dllPath}`);
