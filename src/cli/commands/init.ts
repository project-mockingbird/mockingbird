import type { Command } from 'commander';
import { Engine } from '../../engine/index.js';
import { getRootDir } from '../util.js';

export function registerInitCommand(program: Command): void {
  program
    .command('init')
    .description('Scan existing .yml files and detect modules')
    .action(async () => {
      const rootDir = getRootDir();
      const registryPath = process.env.REGISTRY_PATH;
      const engine = new Engine({ rootDir, registryPath });
      await engine.init();

      const items = engine.getAllItems();
      console.log(`${items.length} items found`);

      if (engine.isRegistryLoaded()) {
        console.log(`Registry: loaded (${engine.registrySize()} OOTB items)`);
      } else {
        console.log('Registry: not found (OOTB references will not be validated)');
      }

      const result = engine.validate();
      if (result.errors.length > 0) {
        console.log(`${result.errors.filter(e => e.severity === 'error').length} errors, ${result.errors.filter(e => e.severity === 'warning').length} warnings`);
      } else {
        console.log('No validation errors');
      }

      await engine.close();
    });
}
