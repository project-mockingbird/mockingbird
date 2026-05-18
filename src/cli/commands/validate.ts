import type { Command } from 'commander';
import { Engine } from '../../engine/index.js';
import { getRootDir } from '../util.js';

export function registerValidateCommand(program: Command): void {
  program.command('validate').description('Validate the entire item tree')
    .option('--format <format>', 'Output format: human or json', 'human')
    .action(async (options) => {
      const rootDir = getRootDir();
      const registryPath = process.env.REGISTRY_PATH;
      const engine = new Engine({ rootDir, registryPath });
      await engine.init();
      const result = engine.validate();

      if (options.format === 'json') {
        const output = {
          ...result,
          registry: {
            loaded: engine.isRegistryLoaded(),
            size: engine.isRegistryLoaded() ? engine.registrySize() : 0,
          },
        };
        console.log(JSON.stringify(output, null, 2));
      } else {
        if (result.valid) {
          console.log('Validation passed - no errors');
        } else {
          for (const error of result.errors) {
            const prefix = error.severity === 'error' ? 'ERROR' : 'WARN';
            console.log(`[${prefix}] ${error.rule}: ${error.message}`);
            if (error.itemPath) console.log(`  Item: ${error.itemPath}`);
            console.log(`  File: ${error.filePath}`);
          }
          console.log(`\n${result.errors.filter(e => e.severity === 'error').length} error(s), ${result.errors.filter(e => e.severity === 'warning').length} warning(s)`);
        }

        if (engine.isRegistryLoaded()) {
          console.log(`Registry: loaded (${engine.registrySize()} OOTB items)`);
        } else {
          console.log('Registry: not found (OOTB references will not be validated)');
        }
      }
      await engine.close();
      process.exit(result.valid ? 0 : 1);
    });
}
