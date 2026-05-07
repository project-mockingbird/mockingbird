import type { Command } from 'commander';
import { unlink } from 'fs/promises';
import { Engine, collectFilePaths } from '../../engine/index.js';
import { getRootDir } from '../util.js';

export function registerDeleteCommand(program: Command): void {
  program
    .command('delete <path>')
    .description('Delete an item and its children')
    .option('--yes', 'Confirm deletion without prompting')
    .action(async (itemPath: string, options: { yes?: boolean }) => {
      const rootDir = getRootDir();
      const engine = new Engine({ rootDir });
      await engine.init();

      const node = engine.getItemByPath(itemPath);
      if (!node) {
        console.error(`Item not found: ${itemPath}`);
        await engine.close();
        process.exit(1);
      }

      // Collect file paths before deletion by peeking
      const filePaths = collectFilePaths(node);

      if (!options.yes) {
        console.log('Would delete the following files:');
        for (const fp of filePaths) {
          console.log(`  ${fp}`);
        }
        console.log('\nRe-run with --yes to confirm.');
        await engine.close();
        process.exit(1);
      }

      try {
        engine.deleteItem(itemPath);
        for (const fp of filePaths) {
          try {
            await unlink(fp);
          } catch {
            // File may not exist on disk; ignore
          }
        }
        console.log(`Deleted ${itemPath}`);
        console.log(`Removed ${filePaths.length} file(s):`);
        for (const fp of filePaths) {
          console.log(`  ${fp}`);
        }
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        await engine.close();
        process.exit(1);
      }

      await engine.close();
    });
}
