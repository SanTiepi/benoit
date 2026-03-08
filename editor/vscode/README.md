# Benoît Language Support for VS Code

Syntax highlighting and language support for `.ben` files.

## Features

- Syntax highlighting for all Benoît constructs
- Comment toggling with `--`
- Auto-indentation after `->`
- Bracket matching and auto-closing
- Folding based on indentation

## Install

### From source (until published on marketplace)

1. Copy this folder to `~/.vscode/extensions/benoit-lang/`
2. Restart VS Code
3. Open any `.ben` file

### Highlighted constructs

- **Functions**: `add a,b -> a + b`
- **Bindings**: `name: "value"`
- **Pattern matching**: `match x -> | 1 => "one"`
- **Pipes**: `data |> parse |> validate`
- **Comments**: `-- this is a comment`
- **String interpolation**: `"Hello {name}"`
- **Test assertions**: `add(2, 3) == 5`
- **Async functions**: `async fetchData url -> await fetch(url)`
- **Loops**: `items each x -> process(x)`

## License

MIT — Part of the [Benoît](https://github.com/SanTiepi/benoit) project.
