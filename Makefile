.PHONY: help setup recon monitor hunt full-scan scan-target clean

SCRIPTS := scripts
GO := go run
TARGET ?=

help: ## Show available commands
	@echo ""
	@echo "  ┌─────────────────────────────────────┐"
	@echo "  │     Bug Bounty Automation Toolkit    │"
	@echo "  │           jclee@dev/bug              │"
	@echo "  └─────────────────────────────────────┘"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'
	@echo ""
	@echo "  Examples:"
	@echo "    make setup                      # First-time setup"
	@echo "    make recon TARGET=target.com     # Full recon on target"
	@echo "    make monitor TARGET=target.com   # Detect NEW findings"
	@echo "    make hunt TARGET=target.com      # Targeted vuln scan"
	@echo "    make full-scan TARGET=target.com # Everything: recon+hunt"
	@echo ""

setup: ## Initial setup — verify tools, download wordlists
	$(GO) $(SCRIPTS)/setup.go $(SCRIPTS)/lib.go

recon: ## Run full recon pipeline on TARGET
	@test -n "$(TARGET)" || (echo "Error: TARGET required. Usage: make recon TARGET=domain.com" && exit 1)
	$(GO) $(SCRIPTS)/recon.go $(SCRIPTS)/lib.go -d $(TARGET)

recon-fast: ## Quick recon — skip nuclei scan
	@test -n "$(TARGET)" || (echo "Error: TARGET required" && exit 1)
	$(GO) $(SCRIPTS)/recon.go $(SCRIPTS)/lib.go -d $(TARGET) -skip-nuclei

monitor: ## Diff monitoring — detect new subdomains/endpoints
	@test -n "$(TARGET)" || (echo "Error: TARGET required" && exit 1)
	$(GO) $(SCRIPTS)/monitor.go $(SCRIPTS)/lib.go -d $(TARGET)

hunt: ## Targeted vulnerability hunting on TARGET
	@test -n "$(TARGET)" || (echo "Error: TARGET required" && exit 1)
	$(GO) $(SCRIPTS)/hunt.go $(SCRIPTS)/lib.go -d $(TARGET)

hunt-idor: ## Hunt IDOR vulnerabilities only
	@test -n "$(TARGET)" || (echo "Error: TARGET required" && exit 1)
	$(GO) $(SCRIPTS)/hunt.go $(SCRIPTS)/lib.go -d $(TARGET) -type idor

hunt-ssrf: ## Hunt SSRF vulnerabilities only
	@test -n "$(TARGET)" || (echo "Error: TARGET required" && exit 1)
	$(GO) $(SCRIPTS)/hunt.go $(SCRIPTS)/lib.go -d $(TARGET) -type ssrf

full-scan: ## Full pipeline — recon + hunt
	@test -n "$(TARGET)" || (echo "Error: TARGET required" && exit 1)
	$(GO) $(SCRIPTS)/recon.go $(SCRIPTS)/lib.go -d $(TARGET)
	$(GO) $(SCRIPTS)/hunt.go $(SCRIPTS)/lib.go -d $(TARGET) -recon-dir $$(ls -td recon/$(TARGET)_* 2>/dev/null | head -1)

clean: ## Remove all scan results
	rm -rf recon/
	@echo "Cleaned all recon results"
