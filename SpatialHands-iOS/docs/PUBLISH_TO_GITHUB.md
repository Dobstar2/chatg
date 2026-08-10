# Publish this repository to GitHub

This download is already a Git repository with a clean `main` commit.

## With GitHub CLI

```bash
gh auth login
gh repo create SpatialHands-iOS --private --source=. --remote=origin --push
```

Change `--private` to `--public` only when you deliberately want the code visible to everyone.

## With GitHub's website

1. Create a blank repository named `SpatialHands-iOS`.
2. Do not add another README, license, or `.gitignore` during creation.
3. Copy the repository URL GitHub shows.
4. From this project's folder, run:

```bash
git remote add origin YOUR_REPOSITORY_URL
git push -u origin main
```

After the push, the included GitHub Actions workflow builds the Xcode project on a macOS runner. The unit-test target is included for local Xcode testing.

## Existing repository option

To keep another repository's root untouched, place the project in a `SpatialHands-iOS/` subdirectory. Move `.github/workflows/spatialhands-ios-build.yml` to the existing repository's root and change the workflow's build commands to run from `SpatialHands-iOS`.
