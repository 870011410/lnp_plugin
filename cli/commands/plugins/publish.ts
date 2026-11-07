import { Args, Flags } from '@oclif/core';
import ReleaseCommand from './lib/release.js';

export default class PublishPlugin extends ReleaseCommand {
  static override summary =
    'Publish the verified archive from a successful packaging task.';
  static override args = {
    run: Args.string({
      required: true,
      description: 'The id returned by app plugins pack.',
    }),
  };
  static override flags = {
    'dry-run': Flags.boolean({
      default: false,
      description: 'Preview without contacting the npm publishing endpoint.',
    }),
  };
  async run() {
    const { args, flags } = await this.parse(PublishPlugin);
    return this.release('publish', args.run, flags['dry-run']);
  }
}
