import type { Command } from 'commander';
import { Engine, classifyItem } from '../../engine/index.js';
import type { ItemNode } from '../../engine/index.js';
import { getRootDir } from '../util.js';

function printTree(node: ItemNode, indent: number): void {
  const itemType = classifyItem(node.item.template);
  const name = node.item.path.split('/').pop() ?? node.item.path;
  console.log(`${'  '.repeat(indent)}${name} [${itemType}]`);
  for (const child of node.children.values()) {
    printTree(child, indent + 1);
  }
}

export function registerTreeCommand(program: Command): void {
  program
    .command('tree')
    .description('Print the item tree')
    .option('--root <path>', 'Root path to print subtree from')
    .action(async (options) => {
      const rootDir = getRootDir();
      const engine = new Engine({ rootDir });
      await engine.init();

      if (options.root) {
        const node = engine.getItemByPath(options.root);
        if (!node) {
          console.error(`Item not found: ${options.root}`);
          await engine.close();
          process.exit(1);
        }
        printTree(node, 0);
      } else {
        const allNodes = engine.getAllItems();
        const roots = allNodes.filter(n => n.parentNode === null);
        for (const root of roots) {
          printTree(root, 0);
        }
      }

      await engine.close();
    });
}
