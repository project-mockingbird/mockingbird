import type { Command } from 'commander';
import { Engine } from '../../engine/index.js';
import { getRootDir } from '../util.js';

export function registerMoveCommand(program: Command): void {
  program
    .command('move <path>')
    .description('Move an item to a new parent')
    .requiredOption('--to <newParentPath>', 'New parent item path')
    .action(async (itemPath: string, options: { to: string }) => {
      const rootDir = getRootDir();
      const engine = new Engine({ rootDir });
      await engine.init();

      try {
        const node = await engine.moveItem(itemPath, options.to);
        console.log(`Moved '${itemPath}' to ${node.item.path}`);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        await engine.close();
        process.exit(1);
      }

      await engine.close();
    });
}
