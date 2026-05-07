import type { Command } from 'commander';
import { Engine, classifyItem } from '../../engine/index.js';
import { FIELD_IDS } from '../../engine/constants.js';
import { getRootDir } from '../util.js';

export function registerInfoCommand(program: Command): void {
  program
    .command('info <path>')
    .description('Show details about an item by path')
    .action(async (itemPath: string) => {
      const rootDir = getRootDir();
      const engine = new Engine({ rootDir });
      await engine.init();

      const node = engine.getItemByPath(itemPath);
      if (!node) {
        console.error(`Item not found: ${itemPath}`);
        await engine.close();
        process.exit(1);
      }

      const { item } = node;
      const itemType = classifyItem(item.template);
      const name = item.path.split('/').pop() ?? item.path;

      console.log(`Name:     ${name}`);
      console.log(`Path:     ${item.path}`);
      console.log(`ID:       ${item.id}`);
      console.log(`Type:     ${itemType}`);
      console.log(`Template: ${item.template}`);
      console.log(`Parent:   ${item.parent}`);
      console.log(`File:     ${node.filePath}`);

      if (item.sharedFields.length > 0) {
        console.log('\nShared Fields:');
        for (const field of item.sharedFields) {
          const label = field.hint ?? field.id;
          console.log(`  ${label}: ${field.value}`);
        }
      }

      // Show language fields
      for (const lang of item.languages) {
        const allFields: Array<{ hint: string; value: string }> = [];
        for (const f of lang.fields) {
          allFields.push({ hint: f.hint ?? f.id, value: f.value });
        }
        for (const ver of lang.versions) {
          for (const f of ver.fields) {
            // Skip noisy system fields unless they have meaningful values
            if (f.id === FIELD_IDS.created || f.id === FIELD_IDS.updated) continue;
            allFields.push({ hint: `${f.hint ?? f.id} (v${ver.version})`, value: f.value });
          }
        }
        if (allFields.length > 0) {
          console.log(`\nLanguage Fields [${lang.language}]:`);
          for (const f of allFields) {
            console.log(`  ${f.hint}: ${f.value}`);
          }
        }
      }

      if (node.children.size > 0) {
        console.log('\nChildren:');
        for (const child of node.children.values()) {
          const childName = child.item.path.split('/').pop() ?? child.item.path;
          const childType = classifyItem(child.item.template);
          console.log(`  ${childName} [${childType}]`);
        }
      }

      await engine.close();
    });
}
