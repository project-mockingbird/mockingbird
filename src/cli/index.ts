#!/usr/bin/env node
import { Command } from 'commander';
import { registerInitCommand } from './commands/init.js';
import { registerValidateCommand } from './commands/validate.js';
import { registerTreeCommand } from './commands/tree.js';
import { registerCreateCommand } from './commands/create.js';
import { registerMoveCommand } from './commands/move.js';
import { registerDeleteCommand } from './commands/delete.js';
import { registerInfoCommand } from './commands/info.js';

const program = new Command();
program.name('mockingbird').description('Mockingbird - YAML-backed CM shim for SitecoreAI').version('0.6.0.0');

registerInitCommand(program);
registerValidateCommand(program);
registerTreeCommand(program);
registerCreateCommand(program);
registerMoveCommand(program);
registerDeleteCommand(program);
registerInfoCommand(program);

program.parse();
