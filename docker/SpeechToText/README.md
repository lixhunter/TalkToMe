# SpeechToText Docker Helpers

This folder includes a `Makefile` to choose Docker daemon/context per command:

- Docker Desktop context (`desktop-linux`) for default runs
- Host/native context (`default`) for GPU passthrough (`/dev/dri`)

## Quick Start

Run from this directory:

```bash
make up
```

GPU run (host/native daemon):

```bash
make gpu-check
make up-gpu
```

Stop stacks:

```bash
make down
make down-gpu
```

## Notes

- Compose daemon selection is done by the Docker CLI (`--context`), not in `docker-compose.yml`.
- If `make up-gpu` fails to connect, ensure the host/native Docker daemon is running and `default` context is valid.
- If ports conflict, stop one stack before starting the other.

