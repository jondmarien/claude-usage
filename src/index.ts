/**
 * claude-usage CLI entry point
 */

import { Command } from 'commander'
import { version } from './version'
import { setDebugMode } from './core/logger.js'
import { CLI_NAME } from './core/env.js'

import { loginCommand } from './commands/login.js'
import { logoutCommand } from './commands/logout.js'
import { statusCommand } from './commands/status.js'
import { quotaCommand } from './commands/quota.js'
import { doctorCommand } from './commands/doctor.js'
import { accountsCommand } from './commands/accounts.js'
import { wakeupCommand } from './commands/wakeup.js'

const program = new Command()

program
  .name(CLI_NAME)
  .description('CLI to track Claude / Claude Code usage and plan quota')
  .version(version)
  .option('--debug', 'Enable debug mode')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts()
    if (opts.debug) {
      setDebugMode(true)
    }
  })

program
  .command('login')
  .description('Import Claude Code credentials or register an API key / setup token')
  .option('--no-browser', 'Print login instructions without assuming a browser')
  .option('--manual', 'Print manual Claude login instructions')
  .option('--api-key [key]', 'Store ANTHROPIC_API_KEY (or the provided key)')
  .option('--token <token>', 'Store a Claude setup / OAuth token')
  .option('-p, --port <port>', 'Ignored (kept for compatibility)', parseInt)
  .action(loginCommand)

program
  .command('logout [email]')
  .description('Remove stored credentials')
  .option('--all', 'Logout from all accounts')
  .action((email, options) => logoutCommand(options, email))

program
  .command('status')
  .description('Show current authentication status')
  .option('--all', 'Show status for all accounts')
  .option('-a, --account <email>', 'Show status for specific account')
  .action(statusCommand)

program
  .command('quota', { isDefault: true })
  .description('Fetch and display Claude usage / quota')
  .option('--json', 'Output as JSON')
  .option('-m, --method <method>', 'Method to use: auto (default), local, or cloud', 'auto')
  .option('--all', 'Show quota for all accounts')
  .option('-a, --account <email>', 'Show quota for specific account')
  .option('--refresh', 'Force refresh (ignore cache)')
  .option('--all-models', 'Include hidden / extra windows in quota display')
  .action(quotaCommand)

const accountsCmd = program
  .command('accounts')
  .description('Manage Claude accounts')

accountsCmd
  .command('list')
  .description('List all accounts')
  .option('--refresh', 'Show refresh tip')
  .action((options) => accountsCommand('list', [], options))

accountsCmd
  .command('add')
  .description('Import another Claude Code / API account')
  .action(() => accountsCommand('add', [], {}))

accountsCmd
  .command('switch <email>')
  .description('Switch to a different account')
  .action((email) => accountsCommand('switch', [email], {}))

accountsCmd
  .command('remove <email>')
  .description('Remove an account')
  .option('--force', 'Skip confirmation')
  .action((email, options) => accountsCommand('remove', [email], options))

accountsCmd
  .command('current')
  .description('Show current active account')
  .action(() => accountsCommand('current', [], {}))

accountsCmd
  .command('refresh [email]')
  .description('Refresh account tokens')
  .option('--all', 'Refresh all accounts')
  .action((email, options) => accountsCommand('refresh', email ? [email] : [], options))

accountsCmd.action(() => accountsCommand('list', [], {}))

program
  .command('doctor')
  .description('Run diagnostics and show configuration')
  .action(doctorCommand)

const wakeupCmd = program
  .command('wakeup')
  .description('Auto wake-up and warm up Claude models')

wakeupCmd
  .command('config')
  .description('Configure auto wake-up schedule')
  .action(() => wakeupCommand('config', [], {}))

wakeupCmd
  .command('trigger')
  .description('Execute one trigger cycle (called by cron / Task Scheduler)')
  .option('--scheduled', 'Mark as scheduled trigger')
  .action((options) => wakeupCommand('trigger', [], options))

wakeupCmd
  .command('install')
  .description('Install wake-up schedule to cron or Windows Task Scheduler')
  .action(() => wakeupCommand('install', [], {}))

wakeupCmd
  .command('uninstall')
  .description('Remove wake-up schedule from the system scheduler')
  .action(() => wakeupCommand('uninstall', [], {}))

wakeupCmd
  .command('test')
  .description('Test trigger manually')
  .option('-e, --email <email>', 'Account email to use for testing')
  .option('-m, --model <model>', 'Model ID to test')
  .option('-p, --prompt <prompt>', 'Test prompt to send', 'hi')
  .action((options) => wakeupCommand('test', [], options))

wakeupCmd
  .command('history')
  .description('View trigger history')
  .option('--limit <n>', 'Number of records to show', '10')
  .option('--json', 'Output as JSON')
  .action((options) => wakeupCommand('history', [], options))

wakeupCmd
  .command('status')
  .description('Show wake-up status and configuration')
  .action(() => wakeupCommand('status', [], {}))

wakeupCmd.action(() => wakeupCommand('status', [], {}))

program.parse()
