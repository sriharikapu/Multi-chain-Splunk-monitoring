import { Command, flags } from '@oclif/command';
import cli from 'cli-ux';
import * as inquirer from 'inquirer';

export default class Hello extends Command {
  static description = 'blah';

  static examples = [`$ buffigen init`];

  static flags = {
    help: flags.help({ char: 'h' }),
    // flag with a value (-n, --name=VALUE)
    name: flags.string({ char: 'n', description: 'name to print' }),
    // flag with no value (-f, --force)
    force: flags.boolean({ char: 'f' }),
  };

  static args = [{ name: 'file' }];

  async run() {
    const { args, flags } = this.parse(Hello);

    const name = await cli.prompt('What is your name?');
    this.log(`hello ${name}`);

    const responses = await inquirer.prompt([
      {
        name: 'stage',
        message: 'select a stage',
        type: 'list',
        choices: [{ name: 'development' }, { name: 'staging' }, { name: 'production' }],
      },
    ]);

    this.log(JSON.stringify(responses));
  }
}
