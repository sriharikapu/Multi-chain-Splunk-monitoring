import { Command, flags } from '@oclif/command';
import cli from 'cli-ux';
import { copy, readdir, mkdir, mkdirp } from 'fs-extra';
import * as inquirer from 'inquirer';
import * as path from 'path';

export default class Init extends Command {
  static description = 'Initialize new multi-chain dev environment';

  static examples = [`$ buffigen init`];

  static flags = {
    help: flags.help({ char: 'h' }),
  };

  static args = [{ name: 'file' }];

  async run() {
    const { args, flags } = this.parse(Init);

    const templatesRoot = path.join(__dirname, '..', '..', '..');

    const projectName = await cli.prompt('Project name');

    const { networks } = await inquirer.prompt([
      {
        name: 'networks',
        message: 'Select the types of networks you want to add to your development environment',
        type: 'checkbox',
        default: ['PoW', 'PoA'],
        choices: [{ name: 'PoW' }, { name: 'PoA' }],
      },
    ]);

    const splunkApps = await readdir(path.join(templatesRoot, 'splunk-apps'));
    const { apps: selectedSplunkApps }: { apps: string[] } = await inquirer.prompt([
      {
        name: 'apps',
        message: 'Select splunk apps to install',
        type: 'checkbox',
        default: splunkApps.filter(app => !app.includes('hyperledger')),
        choices: splunkApps.map(app => ({ name: app })),
      },
    ]);

    const projectRoot = path.join(process.cwd(), projectName);
    await mkdir(projectRoot);

    this.log('\nGenerating docker-compose and copying files...');

    const copyToDest = async (p: string) => {
      cli.action.start(`Copying ${p}...`);
      await copy(path.join(templatesRoot, p), path.join(projectRoot, p), { recursive: true });
      cli.action.stop();
    };

    await copyToDest('abi');
    await copyToDest('ethlogger');
    await copyToDest('files');

    mkdirp(path.join(projectRoot, 'splunk-apps'));
    for (const app of selectedSplunkApps) {
      await copyToDest(path.join('splunk-apps', app));
    }

    // TODO generate docker-compose based on selection
    await copyToDest('.gitignore');
    await copyToDest('docker-compose.yml');

    this.log(`

  Project setup complete 🎉 Next step is to start your dev networks:

  $ cd ${projectName}
  $ docker-compose up
    `);
  }
}
