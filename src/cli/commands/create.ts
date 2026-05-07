import type { Command } from 'commander';
import { Engine } from '../../engine/index.js';
import { getRootDir } from '../util.js';

export function registerCreateCommand(program: Command): void {
  const create = program.command('create').description('Create a new item');

  create
    .command('template <name>')
    .description('Create a new template')
    .requiredOption('--path <parentPath>', 'Parent item path')
    .action(async (name: string, options: { path: string }) => {
      const rootDir = getRootDir();
      const engine = new Engine({ rootDir });
      await engine.init();
      try {
        const node = await engine.createTemplate(name, options.path);
        console.log(`Template '${name}' created at ${node.item.path}`);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        await engine.close();
        process.exit(1);
      }
      await engine.close();
    });

  create
    .command('section <name>')
    .description('Create a new template section')
    .requiredOption('--template <templatePath>', 'Template item path')
    .action(async (name: string, options: { template: string }) => {
      const rootDir = getRootDir();
      const engine = new Engine({ rootDir });
      await engine.init();
      try {
        const node = await engine.createSection(name, options.template);
        console.log(`Section '${name}' created at ${node.item.path}`);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        await engine.close();
        process.exit(1);
      }
      await engine.close();
    });

  create
    .command('field <name>')
    .description('Create a new template field')
    .requiredOption('--section <sectionPath>', 'Template section item path')
    .requiredOption('--type <fieldType>', 'Field type (e.g. "Single-Line Text")')
    .action(async (name: string, options: { section: string; type: string }) => {
      const rootDir = getRootDir();
      const engine = new Engine({ rootDir });
      await engine.init();
      try {
        const node = await engine.createField(name, options.section, options.type);
        console.log(`Field '${name}' created at ${node.item.path}`);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        await engine.close();
        process.exit(1);
      }
      await engine.close();
    });

  create
    .command('rendering <name>')
    .description('Create a new rendering item')
    .requiredOption('--path <parentPath>', 'Parent item path')
    .action(async (name: string, options: { path: string }) => {
      const rootDir = getRootDir();
      const engine = new Engine({ rootDir });
      await engine.init();
      try {
        const node = await engine.createRendering(name, options.path);
        console.log(`Rendering '${name}' created at ${node.item.path}`);
      } catch (err: any) {
        console.error(`Error: ${err.message}`);
        await engine.close();
        process.exit(1);
      }
      await engine.close();
    });
}
