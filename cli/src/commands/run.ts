import { Command, flags } from '@oclif/command';
import * as execa from 'execa';
import DockerComposeProcess from '../docker';
import { buildSplunkApp } from '../splunk/app';

export default class Run extends Command {
  static description = 'blah';

  static examples = [`$ buffigen run --watch`];

  static flags = {
    watch: flags.boolean({ char: 'w', description: 'Watch for changes' }),
  };

  async run() {
    const { args, flags } = this.parse(Run);

    this.log(`Building...`);

    await buildSplunkApp();

    this.log(`Starting local devnet`);

    await Promise.race([this.startDockerCompose(), this.watchForChanges()]);
  }

  async startDockerCompose() {
    const dockerProcess = new DockerComposeProcess('./docker-compose.yml');
    const p = execa('docker-compose', ['up']);

    return {
      p,
      restart,
    };
  }

  async watchForChanges() {}
}
