# Compose helper targets for Docker Desktop (default) and native host Docker (GPU).

COMPOSE_FILE := docker-compose.yml
DD_CONTEXT ?= desktop-linux
HD_CONTEXT ?= default
SERVICE ?= stt-service

.PHONY: help up down logs ps config up-gpu down-gpu logs-gpu ps-gpu config-gpu gpu-check

help:
	@echo "Targets:"
	@echo "  make up        # Start with Docker Desktop context ($(DD_CONTEXT))"
	@echo "  make down      # Stop with Docker Desktop context ($(DD_CONTEXT))"
	@echo "  make logs      # Logs with Docker Desktop context ($(DD_CONTEXT))"
	@echo "  make up-gpu    # Start with host/native context ($(HD_CONTEXT))"
	@echo "  make down-gpu  # Stop with host/native context ($(HD_CONTEXT))"
	@echo "  make logs-gpu  # Logs with host/native context ($(HD_CONTEXT))"
	@echo "  make gpu-check # Verify /dev/dri passthrough on host/native daemon"

up:
	docker --context $(DD_CONTEXT) compose -f $(COMPOSE_FILE) up --build -d

down:
	docker --context $(DD_CONTEXT) compose -f $(COMPOSE_FILE) down

logs:
	docker --context $(DD_CONTEXT) compose -f $(COMPOSE_FILE) logs -f $(SERVICE)

ps:
	docker --context $(DD_CONTEXT) compose -f $(COMPOSE_FILE) ps

config:
	docker --context $(DD_CONTEXT) compose -f $(COMPOSE_FILE) config

up-gpu:
	docker --context $(HD_CONTEXT) compose -f $(COMPOSE_FILE) up --build -d

down-gpu:
	docker --context $(HD_CONTEXT) compose -f $(COMPOSE_FILE) down

logs-gpu:
	docker --context $(HD_CONTEXT) compose -f $(COMPOSE_FILE) logs -f $(SERVICE)

ps-gpu:
	docker --context $(HD_CONTEXT) compose -f $(COMPOSE_FILE) ps

config-gpu:
	docker --context $(HD_CONTEXT) compose -f $(COMPOSE_FILE) config

gpu-check:
	docker --context $(HD_CONTEXT) run --rm --device /dev/dri:/dev/dri alpine sh -lc 'ls -la /dev/dri'

