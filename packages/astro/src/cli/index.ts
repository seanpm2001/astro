/* eslint-disable no-console */

import type { AstroConfig } from '../@types/astro';
import { enableVerboseLogging, LogOptions } from '../core/logger.js';

import * as colors from 'kleur/colors';
import yargs from 'yargs-parser';
import { z } from 'zod';
import { defaultLogDestination } from '../core/logger.js';
import build from '../core/build/index.js';
import add from '../core/add/index.js';
import devServer from '../core/dev/index.js';
import preview from '../core/preview/index.js';
import { check } from './check.js';
import { formatConfigError, loadConfig } from '../core/config.js';
import { printHelp } from '../core/messages.js';

type Arguments = yargs.Arguments;
type CLICommand = 'help' | 'version' | 'add' | 'dev' | 'build' | 'preview' | 'reload' | 'check';

/** Display --help flag */
function printAstroHelp() {
	printHelp({
		commandName: 'astro',
		headline: 'Futuristic web development tool.',
		commands: [
			['add', 'Add an integration to your configuration.'],
			['dev', 'Run Astro in development mode.'],
			['build', 'Build a pre-compiled production-ready site.'],
			['preview', 'Preview your build locally before deploying.'],
			['check', 'Check your project for errors.'],
			['--version', 'Show the version number and exit.'],
			['--help', 'Show this help message.'],
		],
		flags: [
			['--host [optional IP]', 'Expose server on network'],
			['--config <path>', 'Specify the path to the Astro config file.'],
			['--project-root <path>', 'Specify the path to the project root folder.'],
			['--no-sitemap', 'Disable sitemap generation (build only).'],
			['--legacy-build', 'Use the build strategy prior to 0.24.0'],
			['--experimental-ssr', 'Enable SSR compilation.'],
			['--drafts', 'Include markdown draft pages in the build.'],
			['--verbose', 'Enable verbose logging'],
			['--silent', 'Disable logging'],
		],
	});
}

/** Display --version flag */
async function printVersion() {
	// PACKAGE_VERSION is injected at build time
	const version = process.env.PACKAGE_VERSION ?? '';
	console.log();
	console.log(`  ${colors.bgGreen(colors.black(` astro `))} ${colors.green(`v${version}`)}`);
}

/** Determine which command the user requested */
function resolveCommand(flags: Arguments): CLICommand {
	const cmd = flags._[2] as string;
	if (cmd === 'add') return 'add';

	if (flags.version) return 'version';
	else if (flags.help) return 'help';

	const supportedCommands = new Set(['dev', 'build', 'preview', 'check']);
	if (supportedCommands.has(cmd)) {
		return cmd as CLICommand;
	}
	return 'help';
}

/** The primary CLI action */
export async function cli(args: string[]) {
	const flags = yargs(args);
	const cmd = resolveCommand(flags);
	const projectRoot = flags.projectRoot;

	switch (cmd) {
		case 'help':
			printAstroHelp();
			return process.exit(0);
		case 'version':
			await printVersion();
			return process.exit(0);
	}

	// logLevel
	let logging: LogOptions = {
		dest: defaultLogDestination,
		level: 'info',
	};
	if (flags.verbose) {
		logging.level = 'debug';
		enableVerboseLogging();
	} else if (flags.silent) {
		logging.level = 'silent';
	}

	let config: AstroConfig;
	try {
		// Note: ideally, `loadConfig` would return the config AND its filePath
		// For now, `add` has to resolve the config again internally
		config = await loadConfig({ cwd: projectRoot, flags });
	} catch (err) {
		throwAndExit(err);
		return;
	}

	switch (cmd) {
		case 'add': {
			try {
				const packages = flags._.slice(3) as string[];
				await add(packages, { cwd: projectRoot, flags, logging });
				process.exit(0);
			} catch (err) {
				throwAndExit(err);
			}
			return;
		}
		case 'dev': {
			try {
				await devServer(config, { logging });

				await new Promise(() => {}); // don’t close dev server
			} catch (err) {
				throwAndExit(err);
			}
			return;
		}

		case 'build': {
			try {
				await build(config, { logging });
				process.exit(0);
			} catch (err) {
				throwAndExit(err);
			}
			return;
		}

		case 'check': {
			const ret = await check(config);
			return process.exit(ret);
		}

		case 'preview': {
			try {
				await preview(config, { logging }); // this will keep running
			} catch (err) {
				throwAndExit(err);
			}
			return;
		}

		default: {
			throw new Error(`Error running ${cmd}`);
		}
	}
}

/** Display error and exit */
function throwAndExit(err: any) {
	if (err instanceof z.ZodError) {
		console.error(formatConfigError(err));
	} else if (err.stack) {
		const [mainMsg, ...stackMsg] = err.stack.split('\n');
		console.error(colors.red(mainMsg) + '\n' + colors.dim(stackMsg.join('\n')));
	} else {
		console.error(colors.red(err.toString() || err));
	}
	process.exit(1);
}
