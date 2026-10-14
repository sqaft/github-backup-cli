# github-backup-cli

A Node.js/TypeScript CLI (`github-backup`) that backs up every repository you can reach through the GitHub CLI (`gh`): your personal repositories and those of all organizations you belong to, with wikis and Git LFS objects. Backups go to a local directory and/or any S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, MinIO) as git bundle snapshots, and a new snapshot is created only when refs change.

Status: under development. `github-backup list` works; `backup` is not implemented yet. See the plan (Turkish) in [plans/README.md](plans/README.md).
