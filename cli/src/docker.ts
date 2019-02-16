import * as execa from 'execa';

export default class DockerComposeProcess {
  private dockerComposePath: string;
  private p: execa.ExecaChildProcess | null = null;

  constructor(dockerComposePath: string) {
    this.dockerComposePath = dockerComposePath;
  }

  async start() {
    if (this.p) {
      this.stop();
    }
    const args = ['up'];
    this.p = execa('docker-compose', args);
  }

  restart() {
    this.start();
  }

  stop() {
    if (this.p) {
      this.p.kill('SIGHUP');
      this.p = null;
    }
  }
}
