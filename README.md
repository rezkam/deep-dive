# boring

Extensions and skills for [pi](https://github.com/badlogic/pi-mono) — the coding agent.

This is a [pi package](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md). Install it to get all extensions and skills, or pick what you need.

## Install

```bash
# Install the full package
pi install https://github.com/nicepkg/boring

# Or try without installing
pi -e https://github.com/nicepkg/boring
```

## What's Inside

### Extensions

| Extension | Description |
|-----------|-------------|
| [deep-dive](pi-extensions/deep-dive/) | Interactive codebase architecture explorer — generates HTML docs with diagrams and a live chat UI in the browser |

### Skills

*Coming soon.*

## Selective Install

Load only specific parts by filtering in your `settings.json`:

```json
{
  "packages": [
    {
      "source": "https://github.com/nicepkg/boring",
      "skills": []
    }
  ]
}
```

## License

Copyright 2026 Reza Kamali. Licensed under [Apache License 2.0](LICENSE).
