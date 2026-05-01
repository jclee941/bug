#!/bin/bash
# OOB Lab Solver Wrapper using interactsh

export PORTSWIGGER_EMAIL='qws941@kakao.com'
export PORTSWIGGER_PASSWORD='+4ng_YN7:8'"'"'46DM5e3&j|KqK2ap|8y=-'

# Start interactsh client in background and capture domain
INTERACTSH_OUTPUT=$(interactsh-client -ps 2>&1 &)
INTERACTSH_PID=$!

# Wait for domain to be generated
sleep 8

# Extract domain from output
COLLAB_DOMAIN=$(interactsh-client -ps 2>&1 | grep -oP '[a-z0-9]+\.oast\.[a-z0-9]+' | head -1)

if [ -z "$COLLAB_DOMAIN" ]; then
	echo "Failed to get interactsh domain"
	kill $INTERACTSH_PID 2>/dev/null
	exit 1
fi

echo "Using interactsh domain: $COLLAB_DOMAIN"

# Function to solve a lab
solve_lab() {
	local solver=$1
	local base=$2
	local collab=$3

	echo "Solving with: python3 $solver -U $base -C $collab"
	timeout 300 python3 "$solver" -U "$base" -C "$collab" 2>&1
}

# Labs to solve with their solver paths
# These need to be launched via Playwright first, then solved
# For now, just print the commands needed

echo ""
echo "OOB Labs that need -C parameter:"
echo "1. SQLInjection/exploit-lab17.py"
echo "2. XSS/exploit-lab22.py"
echo "3. XSS/exploit-lab23.py"
echo "4. XSS/exploit-lab29.py"
echo "5. SSRF/exploit-lab06.py"
echo "6. OSCommandInjection/exploit-lab04.py"
echo "7. OSCommandInjection/exploit-lab05.py"
echo ""

# Cleanup
kill $INTERACTSH_PID 2>/dev/null
