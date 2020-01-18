# Autointegrator

<a href="https://github.com/brpowell/autointegrator"><img alt="GitHub Actions status" src="https://github.com/brpowell/autointegrator/workflows/Testing/badge.svg?branch=master"></a>

> A bot to automatically ports merge commits to one or more branches.

## How to Use

Apply one or more tags to the pull request you'd like to have ported in the format of `port:branchName`, where `branchName` is the base branch you'd like the bot to open another PR against.

You can also create a configuration file, `.github/autointegrator.yml`, with one or more entries specifying which branches should be ported to when opening a pull request against a given branch. With the following setup, opening a pull request with a base of `master` will automatically apply the labels `port:release` and `port:develop` to it. And against `release` apply `port:develop`

```yaml
triggers:
  master: [release, develop]
  release: [develop]
```

## Setup

The app relies on having some environment variables set. For development, create a `.env` file in the root of the repository and follow the example file [here](https://github.com/brpowell/autointegrator/blob/master/.env.example) for setting it up.

```sh
# Install dependencies
npm install

# Run the bot
npm start

# Run the bot with hot reloading
npm run dev
```

## Contributing

If you have suggestions for how Autointegrator could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2019 Bryan Powell <b.powell@salesforce.com>
