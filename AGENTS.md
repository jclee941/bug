# Bug Bounty Automation Toolkit — Knowledge Base

## OVERVIEW

Go-based bug bounty automation toolkit covering the full hunting workflow:
recon → monitoring → vulnerability hunting → reporting.

## STRUCTURE

```
~/dev/bug/
├── Makefile                  # Orchestration (make help for commands)
├── config/targets.json       # Target and notification configuration
├── scripts/
│   ├── setup.go    (223L)    # Tool verification + wordlist download
│   ├── recon.go    (~350L)   # 5-phase recon pipeline
│   ├── monitor.go  (312L)    # Diff monitoring + crt.sh + Discord alerts
│   └── hunt.go     (509L)    # 4-phase targeted vulnerability hunting
├── notes/
│   ├── phase2-checklist.md   # Learning checklist
│   └── report-template.md    # Bug report template
├── recon/                    # Scan results (gitignored)
├── targets/                  # Target baselines (gitignored)
├── reports/                  # Submitted reports (gitignored)
└── wordlists/                # SecLists downloads (gitignored)
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add a new target | `config/targets.json` |
| Run full recon | `make recon TARGET=x.com` |
| Monitor for changes | `make monitor TARGET=x.com` |
| Hunt vulnerabilities | `make hunt TARGET=x.com` |
| Modify recon pipeline | `scripts/recon.go` |
| Add hunt categories | `scripts/hunt.go` → `huntTypes` slice |
| Change nuclei settings | Each script's flag defaults |
| Report template | `notes/report-template.md` |

## COMMANDS

```bash
make help                        # Show all available commands
make setup                       # First-time setup
make recon TARGET=target.com     # Full recon pipeline
make recon-fast TARGET=target.com # Recon without nuclei
make monitor TARGET=target.com   # Diff-based change detection
make hunt TARGET=target.com      # All vulnerability categories
make hunt-idor TARGET=target.com # IDOR only
make hunt-ssrf TARGET=target.com # SSRF only
make full-scan TARGET=target.com # Recon + hunt combined
make clean                       # Remove scan results
```

## CONVENTIONS

- All scripts are standalone Go files — no go.mod, run via `go run scripts/x.go`
- Each script uses only Go stdlib (no external dependencies)
- Tools are invoked via `os/exec` CLI wrappers
- Results stored in timestamped directories under `recon/`
- Sensitive scan data is gitignored

## ANTI-PATTERNS

- Never commit scan results (recon/, targets/, reports/)
- Never hardcode target domains in scripts
- Never run scans without explicit program authorization
- Never exceed rate limits (default: 100 req/s for nuclei)
