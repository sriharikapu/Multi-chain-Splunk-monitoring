import { copy } from 'fs-extra';
import { join as pathJoin } from 'path';

export async function buildSplunkApp(outputDir: string) {
  await copy(pathJoin(__dirname, '..', '..', '..', 'templates', 'splunk-app'), outputDir);
}
