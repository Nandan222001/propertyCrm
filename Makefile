# =============================================================================
# Developer entry points. `make help` lists everything.
# =============================================================================
.DEFAULT_GOAL := help
PY := /home/user/.venv/bin/python
PIP := $(PY) -m pip

.PHONY: help install dev api web test test-api test-web lint format security \
        migrate seed db-reset build verify docker-up docker-down clean

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Install backend + frontend dependencies
	$(PIP) install -r backend/requirements-dev.txt
	npm ci --ignore-scripts

dev: ## Run the API and the SPA together (Ctrl-C stops both)
	@$(MAKE) -j2 api web

api: ## Run the FastAPI dev server on :8000
	cd backend && ENVIRONMENT=local DB_DIALECT=sqlite SQLITE_PATH=var/demo.sqlite3 \
		$(PY) -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

web: ## Run the Vite dev server on :5173 (proxies /api to :8000)
	npm run dev

test: test-api test-web ## Run every test

test-api: ## Backend test suite (pytest, ~10 s on SQLite)
	cd backend && $(PY) -m pytest tests -q --maxfail=0

test-web: ## Frontend build + render smoke test for every role
	npm run verify

lint: ## Lint Python (ruff) and check shell scripts
	cd backend && $(PY) -m ruff check app tests
	bash -n backend/scripts/backup_mysql.sh backend/scripts/restore_mysql.sh

format: ## Auto-fix Python lint issues
	cd backend && $(PY) -m ruff check app tests --fix

security: ## Local security gate: SAST, dependency audit, secret scan
	cd backend && $(PY) -m bandit -c bandit.yaml -r app -q
	$(PIP) install --quiet pip-audit && $(PY) -m pip_audit -r backend/requirements.txt
	npm audit --audit-level=high

migrate: ## Apply database migrations
	cd backend && $(PY) -m alembic upgrade head

seed: ## Create the schema and load demo data
	cd backend && ENVIRONMENT=local DB_DIALECT=sqlite SQLITE_PATH=var/demo.sqlite3 $(PY) -m app.db.init_db

db-reset: ## Delete the local SQLite database and reseed it
	rm -f backend/var/demo.sqlite3 && $(MAKE) seed

build: ## Production build of the SPA
	npm run build

verify: ## Everything CI enforces (tests, lint, security, build, smoke)
	$(MAKE) test-api
	$(MAKE) lint
	$(MAKE) security
	$(MAKE) test-web

docker-up: ## Start the full stack (MySQL, Redis, API, web) on :8080
	docker compose up --build -d && docker compose ps

docker-down: ## Stop the stack and keep volumes
	docker compose down

clean: ## Remove build output and caches
	rm -rf dist node_modules/.vite backend/.pytest_cache backend/.ruff_cache
