# patcher-action
A GitHub Action for running Patcher.

You can find out more about Gruntwork Patcher at [gruntwork.io](https://gruntwork.io/patcher) and by reading the [latest docs](https://docs.gruntwork.io/patcher/).

## Usage

See [action.yml](action.yml)

### Basic
It will run `patcher update` in the whole repo, and open a Pull Request with the changes.

```yaml
steps:
  - uses: actions/checkout@v3
  - uses: gruntwork-io/patcher
    with:
      github_token: ${{ secrets.GITHUB_TOKEN }}
```

### Promotion Workflows 

Refer to the [Promotion Workflows with Terraform](https://blog.gruntwork.io/promotion-workflows-with-terraform-13c05bed953d).

