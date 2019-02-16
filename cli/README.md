# buffigen

Generates local dev-testnets for dapp development

[![oclif](https://img.shields.io/badge/cli-oclif-brightgreen.svg)](https://oclif.io)
[![Version](https://img.shields.io/npm/v/buffigen.svg)](https://npmjs.org/package/buffigen)
[![Downloads/week](https://img.shields.io/npm/dw/buffigen.svg)](https://npmjs.org/package/buffigen)
[![License](https://img.shields.io/npm/l/buffigen.svg)](https://github.com/ziegfried/ethdenver/blob/master/package.json)

<!-- toc -->

- [Usage](#usage)
- [Commands](#commands)
  <!-- tocstop -->

# Usage

<!-- usage -->

```sh-session
$ npm install -g buffigen
$ buffigen COMMAND
running command...
$ buffigen (-v|--version|version)
buffigen/0.0.1 darwin-x64 node-v11.2.0
$ buffigen --help [COMMAND]
USAGE
  $ buffigen COMMAND
...
```

<!-- usagestop -->

# Commands

<!-- commands -->

- [`buffigen hello [FILE]`](#buffigen-hello-file)
- [`buffigen help [COMMAND]`](#buffigen-help-command)

## `buffigen hello [FILE]`

describe the command here

```
USAGE
  $ buffigen hello [FILE]

OPTIONS
  -f, --force
  -h, --help       show CLI help
  -n, --name=name  name to print

EXAMPLE
  $ buffigen hello
  hello world from ./src/hello.ts!
```

_See code: [src/commands/hello.ts](https://github.com/ziegfried/ethdenver/blob/v0.0.1/src/commands/hello.ts)_

## `buffigen help [COMMAND]`

display help for buffigen

```
USAGE
  $ buffigen help [COMMAND]

ARGUMENTS
  COMMAND  command to show help for

OPTIONS
  --all  see all commands in CLI
```

_See code: [@oclif/plugin-help](https://github.com/oclif/plugin-help/blob/v2.1.6/src/commands/help.ts)_

<!-- commandsstop -->
