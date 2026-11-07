import { Args, Flags } from '@oclif/core';
import ReleaseCommand from './lib/release.js';

export default class PackPlugin extends ReleaseCommand {
  static override summary =
    'Build when configured and pack a local plugin into an immutable npm tarball.';
  static override args = {
    plugin: Args.string({
      required: true,
      description: 'Directory name below packages/.',
    }),
  };
  static override flags = {
    'dry-run': Flags.boolean({
      default: false,
      description: 'Preview without running a build or writing an archive.',
    }),
  };
  async run() {
    const { args, flags } = await this.parse(PackPlugin);
    return this.release('pack', args.plugin, flags['dry-run']);
  }
}
